/**
 * Notification Service
 * Sends job alerts via email, Telegram, and Slack
 */

const pool = require('../../db/client');
const nodemailer = require('nodemailer');
const axios = require('axios');

class NotificationService {
  /**
   * Check for new jobs matching user preferences and send alerts
   */
  async sendNewJobAlerts() {
    console.log('[Notifications] Starting job alert cycle...');

    // Get all active user preferences
    const preferences = await this.getUserPreferences();
    console.log(`[Notifications] Found ${preferences.length} users with preferences`);

    let alertsSent = 0;

    for (const pref of preferences) {
      try {
        // Find matching jobs for this user
        const jobs = await this.findMatchingJobs(pref);

        if (jobs.length === 0) continue;

        console.log(`[Notifications] Found ${jobs.length} matching jobs for user ${pref.user_id}`);

        // Send alerts
        const sent = await this.sendAlertsForJobs(pref.user_id, jobs, pref);
        alertsSent += sent;
      } catch (error) {
        console.error(`[Notifications] Failed to alert user ${pref.user_id}:`, error.message);
      }
    }

    console.log(`[Notifications] Sent ${alertsSent} alerts`);
    return { alertsSent };
  }

  /**
   * Get all user preferences
   */
  async getUserPreferences() {
    const query = `
      SELECT * FROM user_preferences
      ORDER BY user_id ASC;
    `;

    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Find jobs matching user preferences
   */
  async findMatchingJobs(preferences) {
    let query = `
      SELECT j.* FROM jobs j
      WHERE j.is_active = TRUE
        AND j.relevance_score >= $1
        AND j.posted_at > NOW() - INTERVAL '24 hours'
    `;

    const params = [preferences.min_relevance_score || 70];

    // Filter by role keywords
    if (preferences.desired_roles && preferences.desired_roles.length > 0) {
      query += `
        AND (
          ${preferences.desired_roles
            .map(
              (_, i) =>
                `j.title ILIKE $${params.length + i + 1}`
            )
            .join(' OR ')}
        )
      `;
      params.push(...preferences.desired_roles.map((r) => `%${r}%`));
    }

    // Filter by location
    if (preferences.desired_locations && preferences.desired_locations.length > 0) {
      query += `
        AND (
          ${preferences.desired_locations
            .map(
              (_, i) =>
                `j.location ILIKE $${params.length + i + 1}`
            )
            .join(' OR ')}
        )
      `;
      params.push(...preferences.desired_locations.map((l) => `%${l}%`));
    }

    // Filter by tech stack (at least one tech match)
    if (preferences.required_tech_stack && preferences.required_tech_stack.length > 0) {
      query += `
        AND j.tech_stack && $${params.length + 1}
      `;
      params.push(preferences.required_tech_stack);
    }

    // Exclude companies
    if (preferences.excluded_companies && preferences.excluded_companies.length > 0) {
      query += `
        AND j.company_name NOT IN (
          ${preferences.excluded_companies
            .map(
              (_, i) =>
                `$${params.length + i + 1}`
            )
            .join(',')}
        )
      `;
      params.push(...preferences.excluded_companies);
    }

    // Exclude tech stack
    if (preferences.avoid_tech_stack && preferences.avoid_tech_stack.length > 0) {
      query += `
        AND NOT (j.tech_stack && $${params.length + 1})
      `;
      params.push(preferences.avoid_tech_stack);
    }

    // Check that we haven't already alerted this user about this job
    query += `
      AND NOT EXISTS (
        SELECT 1 FROM user_alerts
        WHERE user_alerts.user_id = $${params.length + 1}
          AND user_alerts.job_id = j.id
      )
      ORDER BY j.relevance_score DESC
      LIMIT 10
    `;
    params.push(preferences.user_id);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Send alerts for jobs via configured channels
   */
  async sendAlertsForJobs(userId, jobs, preferences) {
    let alertsSent = 0;

    for (const job of jobs) {
      try {
        // Email
        if (preferences.alert_email) {
          await this.sendEmailAlert(preferences.alert_email, job);
          alertsSent++;
          await this.recordAlert(userId, job.id, 'email');
        }

        // Telegram
        if (preferences.telegram_chat_id) {
          await this.sendTelegramAlert(preferences.telegram_chat_id, job);
          alertsSent++;
          await this.recordAlert(userId, job.id, 'telegram');
        }

        // Slack
        if (preferences.slack_webhook_url) {
          await this.sendSlackAlert(preferences.slack_webhook_url, job);
          alertsSent++;
          await this.recordAlert(userId, job.id, 'slack');
        }
      } catch (error) {
        console.error(`[Notifications] Failed to alert for job ${job.id}:`, error.message);
      }
    }

    return alertsSent;
  }

  /**
   * Send email notification
   */
  async sendEmailAlert(email, job) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@jobs.example.com',
      to: email,
      subject: `🚀 New Job Alert: ${job.title} at ${job.company_name}`,
      html: `
        <h2>${job.title}</h2>
        <p><strong>${job.company_name}</strong> • ${job.location}</p>
        <p><strong>Relevance Score:</strong> ${job.relevance_score}/100</p>
        <p><strong>Tech Stack:</strong> ${(job.tech_stack || []).join(', ')}</p>
        <p><strong>Seniority:</strong> ${job.seniority_level || 'N/A'}</p>
        <p>${job.description.substring(0, 500)}...</p>
        <p><a href="${job.apply_url}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Apply Now</a></p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[Email] Sent to ${email} for job ${job.id}`);
    } catch (error) {
      console.error(`[Email] Failed to send to ${email}:`, error.message);
      throw error;
    }
  }

  /**
   * Send Telegram notification
   */
  async sendTelegramAlert(chatId, job) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN not configured');

    const message = `
🚀 <b>New Job Alert!</b>

<b>${job.title}</b>
${job.company_name} • ${job.location}

<b>Relevance:</b> ${job.relevance_score}/100
<b>Tech Stack:</b> ${(job.tech_stack || []).join(', ')}
<b>Seniority:</b> ${job.seniority_level || 'N/A'}

<a href="${job.apply_url}">View & Apply →</a>
    `.trim();

    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      });
      console.log(`[Telegram] Sent to ${chatId} for job ${job.id}`);
    } catch (error) {
      console.error(`[Telegram] Failed to send to ${chatId}:`, error.message);
      throw error;
    }
  }

  /**
   * Send Slack notification
   */
  async sendSlackAlert(webhookUrl, job) {
    const payload = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚀 New Job Alert!',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Position:*\n${job.title}`,
            },
            {
              type: 'mrkdwn',
              text: `*Company:*\n${job.company_name}`,
            },
            {
              type: 'mrkdwn',
              text: `*Location:*\n${job.location}`,
            },
            {
              type: 'mrkdwn',
              text: `*Relevance:*\n${job.relevance_score}/100`,
            },
          ],
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Tech Stack:* ${(job.tech_stack || []).join(', ')}\n*Seniority:* ${
              job.seniority_level || 'N/A'
            }`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View & Apply',
              },
              url: job.apply_url,
              style: 'primary',
            },
          ],
        },
      ],
    };

    try {
      await axios.post(webhookUrl, payload);
      console.log(`[Slack] Sent to webhook for job ${job.id}`);
    } catch (error) {
      console.error(`[Slack] Failed to send:`, error.message);
      throw error;
    }
  }

  /**
   * Record alert in database
   */
  async recordAlert(userId, jobId, alertType) {
    const query = `
      INSERT INTO user_alerts (user_id, job_id, alert_type, sent_at)
      VALUES ($1, $2, $3, NOW())
    `;

    await pool.query(query, [userId, jobId, alertType]);
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(hoursBack = 24) {
    const query = `
      SELECT
        alert_type,
        COUNT(*) as total,
        COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END) as sent,
        COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as failed
      FROM user_alerts
      WHERE created_at > NOW() - INTERVAL '1 hour' * $1
      GROUP BY alert_type
    `;

    const result = await pool.query(query, [hoursBack]);
    return result.rows;
  }
}

module.exports = new NotificationService();
