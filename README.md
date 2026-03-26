# Portfolio MCS

A modern, microservices-based portfolio management system built with Next.js, Node.js, and PostgreSQL. Features a public portfolio website and a private admin CMS for content management.

## 🏗️ Architecture

| Service | Technology | Purpose | Port | Domain |
|---------|------------|---------|------|--------|
| **user-ui** | Next.js 14 + React 18 + TypeScript | Public portfolio website | 3000 | https://johnisah.com |
| **admin-ui** | Next.js 14 + React 18 + TypeScript | Private CMS dashboard | 3001 | https://admin.johnisah.com |
| **api** | Node.js + Express.js | REST API with authentication | 4000 | https://api.johnisah.com |
| **db** | PostgreSQL 16 | Database with file storage | 5432 | Internal only |

### Tech Stack

**Frontend:**
- Next.js 14 (App Router)
- React 18 with TypeScript
- Tailwind CSS for styling
- Server-side rendering with revalidation

**Backend:**
- Node.js 20+ with Express.js
- JWT authentication with bcryptjs
- PostgreSQL with connection pooling
- File upload handling with Multer
- Security middleware (Helmet, CORS, Rate limiting)

**Infrastructure:**
- Docker & Docker Compose for development
- Kubernetes manifests for production
- Health checks and service dependencies

## 📊 Database Schema

The application manages portfolio content across several tables:

- **`profile`** - Personal information (single row)
- **`projects`** - Portfolio projects with tech stack, images, and links
- **`skills`** - Technical skills with proficiency levels and categories
- **`experiences`** - Work experience with company details and dates
- **`certifications`** - Professional certifications with issuers and dates
- **`contact_messages`** - Messages from the contact form
- **`admin_user`** - Admin authentication (single user)

All tables include proper indexing and automatic `updated_at` timestamps.

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Make (optional, for convenience commands)

### Development Setup

1. **Clone and setup environment:**
   ```bash
   git clone <repository-url>
   cd portfolio-mcs
   make setup  # Creates .env from .env.example
   ```

2. **Configure environment variables:**
   Edit `api/.env` and set:
   - `JWT_SECRET` - Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - Database credentials (optional, defaults provided)

3. **Start all services:**
   ```bash
   make up
   ```

4. **Access the applications:**
   - Public portfolio: http://localhost:3000
   - Admin dashboard: http://localhost:3001
   - API documentation: http://localhost:4000/api/health

### First Admin Login

1. The database is seeded with a default admin user:
   - **Username:** `admin`
   - **Password:** `admin123` (change this immediately!)

2. Login at http://localhost:3001 and update your password

3. Use the admin dashboard to populate your portfolio content

## 📁 Project Structure

```
portfolio-mcs/
├── docker-compose.yml    # Development orchestration
├── Makefile             # Convenience commands
├── api/                 # REST API service
│   ├── src/
│   │   ├── index.js     # Express app setup
│   │   ├── routes/      # API endpoints
│   │   │   ├── auth.js
│   │   │   ├── profile.js
│   │   │   ├── projects.js
│   │   │   ├── skills.js
│   │   │   ├── experiences.js
│   │   │   ├── certifications.js
│   │   │   └── contact.js
│   │   ├── middleware/  # Auth, error handling
│   │   └── db/          # Database client
│   ├── package.json
│   └── .env.example
├── user-ui/             # Public portfolio (Next.js)
│   ├── src/app/
│   │   ├── page.tsx     # Homepage with all sections
│   │   ├── layout.tsx
│   │   └── components/  # Portfolio sections
│   ├── package.json
│   └── next.config.js
├── admin-ui/            # Admin CMS (Next.js)
│   ├── src/app/
│   │   ├── login/       # Authentication
│   │   ├── dashboard/   # Content management
│   │   └── layout.tsx
│   └── package.json
├── db/                  # PostgreSQL setup
│   ├── schema.sql       # Database schema
│   ├── seed.sql         # Initial data
│   └── Dockerfile
└── k8s/                 # Kubernetes manifests
    ├── secrets/         # Secret templates
    ├── ingress/         # Load balancer config
    ├── db/
    ├── api/
    ├── user-ui/
    └── admin-ui/
```

## 🔧 Development Commands

The `Makefile` provides convenient shortcuts:

```bash
# Setup
make setup          # Create .env file
make hash-password  # Generate bcrypt hash for admin password

# Services
make up             # Start all services
make down           # Stop all services
make restart        # Restart all services
make rebuild        # Force rebuild all images

# Individual services
make up-db          # Database only
make up-api         # Database + API
make up-user        # Database + API + User UI
make up-admin       # Database + API + Admin UI

# Monitoring
make logs           # Tail all service logs
make status         # Show container status

# Cleanup
make clean          # Remove all containers, volumes, images
```

## 🌐 API Endpoints

### Public Endpoints (No Auth Required)
- `GET /api/health` - Service health check
- `GET /api/profile` - Portfolio owner's profile
- `GET /api/projects` - Published projects
- `GET /api/skills` - Technical skills
- `GET /api/experiences` - Work experience
- `GET /api/certifications` - Certifications
- `POST /api/contact` - Send contact message

### Admin Endpoints (JWT Required)
- `POST /api/auth/login` - Admin authentication
- `GET/PUT /api/profile` - Manage profile
- `GET/POST/PUT/DELETE /api/projects` - CRUD projects
- `GET/POST/PUT/DELETE /api/skills` - CRUD skills
- `GET/POST/PUT/DELETE /api/experiences` - CRUD experiences
- `GET/POST/PUT/DELETE /api/certifications` - CRUD certifications
- `GET/PATCH /api/contact` - View/manage contact messages

### Authentication
- Send `Authorization: Bearer <jwt-token>` header
- Tokens expire in 7 days (configurable via `JWT_EXPIRES_IN`)

## 🎨 Features

### Public Portfolio
- **Hero Section** - Name, headline, bio, avatar
- **Projects** - Featured work with tech stacks, live/repo links
- **Skills** - Categorized technical skills with proficiency levels
- **Experience** - Work history with company details
- **Certifications** - Professional credentials
- **Contact Form** - Send messages to portfolio owner

### Admin Dashboard
- **Content Management** - CRUD operations for all portfolio sections
- **File Uploads** - Images for projects, skills, experiences, certifications
- **Message Management** - View and mark contact messages as read
- **Publishing Controls** - Draft/publish projects
- **Ordering** - Custom sort order for all content types

### Technical Features
- **Responsive Design** - Mobile-first with Tailwind CSS
- **SEO Optimized** - Server-side rendering with Next.js
- **Security** - JWT auth, CORS, rate limiting, input validation
- **Performance** - Image optimization, caching, compression
- **Health Checks** - Service monitoring and dependency management

## 🚢 Production Deployment

### Docker Images
Each service builds its own optimized Docker image:
- Multi-stage builds for minimal image size
- Non-root user execution
- Health check endpoints

### Kubernetes Deployment
Apply manifests in order:
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets/
kubectl apply -f k8s/db/
kubectl apply -f k8s/api/
kubectl apply -f k8s/user-ui/
kubectl apply -f k8s/admin-ui/
kubectl apply -f k8s/ingress/
```

### Environment Variables
Production requires these additional environment variables:
- `NODE_ENV=production`
- Secure `JWT_SECRET` (64+ character random string)
- Production database URL
- Domain-specific `ALLOWED_ORIGINS`

## 🔒 Security

- **Authentication:** JWT tokens with bcrypt password hashing
- **Authorization:** Route-level middleware protection
- **CORS:** Configured allowed origins
- **Rate Limiting:** API endpoint protection
- **Input Validation:** Request sanitization
- **Security Headers:** Helmet.js middleware
- **File Upload Security:** Type validation and size limits

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes and test locally
4. Ensure all services build and run: `make rebuild`
5. Commit changes: `git commit -am 'Add your feature'`
6. Push to branch: `git push origin feature/your-feature`
7. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**John Itopa ISAH**
- Email: johnitopaisah@gmail.com
- GitHub: [@johnitopaisah](https://github.com/johnitopaisah)
- LinkedIn: [johnitopaisah](https://linkedin.com/in/johnitopaisah)

---

Built with ❤️ using Next.js, Node.js, and PostgreSQL. Deployed on Kubernetes.
