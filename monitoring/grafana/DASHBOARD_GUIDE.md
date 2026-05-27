# Visitor Analytics Dashboard — Professional Edition

## 📊 Overview

The enhanced Visitor Analytics Dashboard provides comprehensive, actionable insights into your portfolio's traffic patterns, visitor quality, and geographic performance. Designed for professional analysis and decision-making.

---

## 🎯 Dashboard Structure

### **Section 1: Key Performance Indicators (Top Row)**

Six critical metrics with sparkline trends:

| Metric | Insight | Unit | Threshold |
|--------|---------|------|-----------|
| **Total Visitors (24h)** | Raw visitor count | Count | Growth indicator |
| **Unique Visitors (24h)** | Session-based unique count | Count | Engagement metric |
| **Repeat Visitor Rate** | % of returning visitors | % | Loyalty indicator |
| **Avg Session Duration** | Time spent per visit | Seconds | Quality metric |
| **Bounce Rate (24h)** | % visitors who left after 1 page | % | Engagement metric |
| **Real Traffic %** | Human vs bot traffic ratio | % | Spam detection |

**Color coding:**
- 🟢 Green: Healthy metrics, good growth
- 🟡 Yellow: Warning, watch trend
- 🔴 Red: Critical, needs attention
- 🔵 Blue: Reference metrics, neutral

**How to use:**
- Track daily, compare to yesterday
- Identify trends over time
- Set targets for each metric
- Alert if bounce rate > 60% or session duration < 60s

---

### **Section 2: Traffic Trends (Timeline + Heatmap)**

#### **Panel 7: Visitor Traffic Trend — Last 7 Days**
- **Type:** Line chart with area fill
- **Shows:** Hourly visitor count + bot attempts
- **Columns:** Time (x-axis), visitor count (y-axis)
- **Color coding:**
  - 🟢 Green area: Real visitor traffic
  - 🔴 Red line: Blocked bot attempts

**Usage:**
- Identify peak traffic hours (optimization opportunity)
- Spot anomalies or traffic spikes
- Correlate with deployments/events
- Plan performance testing during low-traffic windows

#### **Panel 8: Traffic Heatmap — Hourly Distribution**
- **Type:** Heatmap (days vs hours)
- **Darker color** = More traffic
- **Lighter color** = Less traffic

**Usage:**
- Identify consistent peak traffic hours across days
- Plan deployments during low-traffic hours (e.g., 3-4 AM UTC)
- Schedule monitoring/maintenance windows
- Optimize marketing campaigns for peak hours

---

### **Section 3: Quick Insights (Overview Cards)**

Four stat cards showing:
- **Top Traffic Source:** Which source drives most visitors
- **Top Country:** Geographic origin of traffic
- **Popular Device:** Desktop vs Mobile dominance
- **Peak Traffic Hour:** Time of maximum activity

**Usage:**
- Quick sanity check of traffic sources
- Identify geographic markets
- Optimize for dominant device type
- Schedule content updates during peak hours

---

### **Section 4: Deep Analysis Tables**

#### **Panel 13: Traffic Source Quality Analysis**
- **Columns:** Referrer, Traffic Volume, Bounce Rate, Avg Duration
- **Sorted by:** Traffic volume (descending)

**Key insights:**
- Identify which sources drive quality traffic (longer sessions)
- Which sources have high bounce rates (maybe low quality)
- Direct traffic usually = quality visitors
- Search engine = quality + volume
- Social media = volume but often lower engagement

**Action items:**
- Double down on high-quality sources
- Investigate high-bounce sources
- Improve landing pages for low-performing sources

#### **Panel 15: Device & Browser Performance**
- **Columns:** Device Type, Browser, Traffic Count, Avg Session Duration
- **Shows:** Which devices/browsers your visitors use

**Usage:**
- Identify if you need mobile optimization
- Test on popular browsers (Chrome, Safari, Firefox)
- Detect compatibility issues
- Optimize for dominant device/browser combo

#### **Panel 17: Referrer Source Details**
- **Columns:** Referrer, Visitor Count, % of Total
- **Sorted by:** Visitor count (descending)

**Usage:**
- Complete breakdown of all traffic sources
- Identify niche sources driving traffic
- Spot changes in source distribution
- Plan SEO/marketing strategy around top sources

---

### **Section 5: Geographic & Device Distribution**

#### **Panel 14: Top Countries (Last 7d)**
- **Type:** Bar gauge with gradient colors
- **Sorted by:** Visitor count

**Usage:**
- Identify key geographic markets
- Localize content for top countries
- Plan for timezone-specific traffic peaks
- Target ads to high-traffic regions

#### **Panel 16: Traffic Distribution (24h)**
- **Type:** Donut pie chart
- **Shows:** Desktop vs Mobile vs Tablet breakdown

**Usage:**
- Quick visual of device type distribution
- Prioritize mobile if >60% mobile traffic
- Ensure responsive design works on dominant devices
- Track device trend over time

---

### **Section 6: Comparison & Bot Analysis (Bottom)**

#### **Panel 18: 7-Day Comparison**
- **Shows:** Today's traffic vs 7-day average
- **Ratio > 1.0:** More traffic than usual (positive)
- **Ratio < 1.0:** Less traffic than usual (investigate)

**Usage:**
- Quick baseline comparison
- Detect unusual traffic patterns
- Validate marketing campaign impact
- Spot potential issues (outage, DDoS, etc.)

#### **Panel 19: Bot Activity (24h)**
- **Shows:** Number of bot attempts blocked
- **Helps identify:** Spam/scraper attacks

**Usage:**
- Monitor bot attacks
- Adjust bot filters if too aggressive
- Track bot trends
- Correlate with traffic spikes

---

## 🎨 Color Scheme

| Color | Meaning | Metrics |
|-------|---------|---------|
| 🟢 Green | Healthy, good | Visitors, Unique, Real Traffic %, Device |
| 🔵 Blue | Reference, neutral | Unique Visitors, Traffic Sources |
| 🟡 Yellow | Warning, watch | Bounce Rate (30-50%), Session Duration (60-120s) |
| 🟠 Orange | Concerning | High bounce rate (>50%), Short sessions (<60s) |
| 🔴 Red | Alert, action needed | Bot traffic, Bounce Rate (>70%) |
| 🟣 Purple | Trending metric | Bots Blocked, Peak Hour |

---

## 📈 Recommended Metrics to Monitor

### **Daily Checks:**
- [ ] Total visitors trend (compare to yesterday)
- [ ] Bounce rate (should be <35% for portfolio)
- [ ] Real traffic % (should be >95%)
- [ ] Top traffic sources (any changes?)

### **Weekly Checks:**
- [ ] Total unique visitors (week-over-week growth)
- [ ] Geographic distribution (key markets)
- [ ] Device breakdown (mobile vs desktop)
- [ ] Top countries and sources

### **Monthly Checks:**
- [ ] YoY growth trends
- [ ] Return visitor percentage (growing?)
- [ ] Source quality comparison
- [ ] Bot attack trends
- [ ] Performance by country/region

---

## 💡 Interpretation Examples

### **Example 1: High Bounce Rate (>50%)**
- **Possible causes:**
  - Poor landing page experience
  - Slow page load
  - Mobile optimization needed
  - Irrelevant traffic source
- **Actions:**
  - Improve page load speed
  - A/B test landing page
  - Target traffic sources better
  - Ensure mobile responsiveness

### **Example 2: Traffic Spike**
- **Possible causes:**
  - Marketing campaign launched
  - Viral mention/backlink
  - Search engine ranking improvement
  - Event/news mention
- **Actions:**
  - Check traffic sources to identify cause
  - Monitor conversion funnel
  - Prepare for sustained traffic
  - Optimize high-performing pages

### **Example 3: Unusual Geographic Pattern**
- **Possible causes:**
  - Backlink from regional site
  - Marketing campaign in specific country
  - Bot attack from specific region
- **Actions:**
  - Drill down by source
  - Check average session duration per country
  - Adjust content/targeting accordingly

### **Example 4: Low Average Session Duration (<60s)**
- **Possible causes:**
  - Users finding information quickly ✅
  - Poor navigation/UX ❌
  - Relevant traffic landing on wrong page ❌
- **Actions:**
  - Cross-reference with bounce rate
  - If bounce high: fix UX
  - If bounce low: users satisfied (good)

---

## 🔧 Dashboard Configuration

### **Time Range Selection**
- **Default:** Last 7 days (balanced view of recent trends)
- **Options available:**
  - Last 24 hours: Daily monitoring
  - Last 7 days: Weekly trends
  - Last 30 days: Monthly patterns

### **Refresh Rate**
- **Current:** 5 minutes
- **For real-time:** Change to 1 minute (higher system load)
- **For static view:** Change to 30 minutes or disable auto-refresh

### **Custom Queries**
Advanced users can modify PromQL queries to:
- Filter by specific referrer
- Compare time periods
- Create custom calculations
- Build custom alerts

---

## 📊 Data Source

**Metrics collected from:**
- `portfolio_visitors_total` — Total visitor counter
- `portfolio_visitors_by_country_total` — Geographic breakdown
- `portfolio_visitors_by_referrer_total` — Traffic source breakdown
- `portfolio_visitors_by_device_total` — Device type distribution
- `portfolio_visitors_by_browser_total` — Browser distribution
- `portfolio_visitor_bots_filtered_total` — Bot detection counter

**Collection interval:** Every API request (real-time)  
**Retention:** 15 days (Prometheus default)  
**Scrape frequency:** 30 seconds  

---

## ⚙️ Alerts & Actions

### **Recommended Alerts to Create:**

```yaml
# Alert: High Bounce Rate
alert: HighBounceRate
if: bounce_rate > 0.5
for: 1 hour
severity: warning

# Alert: Bot Attack
alert: BotAttackDetected
if: increase(portfolio_visitor_bots_filtered_total[5m]) > 100
for: 5 minutes
severity: critical

# Alert: Traffic Anomaly
alert: TrafficAnomaly
if: abs(current_traffic - avg_traffic) > stddev(traffic) * 2
for: 10 minutes
severity: warning

# Alert: Low Real Traffic %
alert: LowRealTraffic
if: real_traffic_percent < 0.9
for: 30 minutes
severity: warning
```

---

## 🚀 Next Steps

1. **Deploy dashboard:** Grafana auto-loads from ConfigMap
2. **Set baseline metrics:** Record current values as baseline
3. **Create alerts:** Configure thresholds for your targets
4. **Monitor daily:** Review key metrics each morning
5. **Share with stakeholders:** Use for reporting/communication
6. **Iterate:** Adjust panels based on your needs

---

## 📚 Related Documentation

- **Data Collection:** See [/monitoring/api/metrics.js](../../api/metrics.js)
- **Grafana Config:** See [/monitoring/grafana/](../)
- **API Endpoints:** `GET /api/visitors/stats` (analytics endpoint)
- **Backup Procedure:** Grafana dashboards backed up daily at 04:00 UTC

---

## 🎓 Tips for Maximum Impact

- **Combination analysis:** Don't look at metrics in isolation
- **Trend over absolutes:** Focus on direction, not just numbers
- **Drill down:** Use filters to investigate anomalies
- **Compare periods:** 24h vs 7-day vs 30-day perspectives
- **Share insights:** Create reports from dashboard for stakeholders
- **Iterate:** Update dashboard as new insights emerge

---

**Version:** 2.0 (Enhanced Professional Edition)  
**Last Updated:** 24 April 2026  
**Created for:** Portfolio MCS Visitor Analytics
