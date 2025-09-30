# Mastra Test Application

A production-ready Mastra application with containerized deployment, automated CI/CD, and comprehensive security configurations.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Docker Configuration](#docker-configuration)
- [Deployment](#deployment)
- [Security](#security)
- [Environment Configuration](#environment-configuration)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Overview

This project demonstrates a fully configured Mastra application with:

- **Multi-stage Docker builds** for optimized production images
- **Automated GitHub Actions CI/CD** pipeline
- **Security scanning** with Trivy
- **Multi-environment support** (development/production)
- **Health monitoring** and rollback capabilities
- **Container security** best practices

## Prerequisites

- Node.js 20+
- pnpm package manager
- Docker and Docker Buildx
- Access to deployment servers (if deploying)

## Quick Start

### Local Development

1. **Clone and setup**:

   ```bash
   git clone <repository-url>
   cd mastra-test
   pnpm install
   ```

2. **Environment setup**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Generate Prisma client**:

   ```bash
   pnpm prisma:generate
   ```

4. **Start development server**:
   ```bash
   pnpm dev
   ```

### Docker Development

1. **Build Docker image**:

   ```bash
   docker build -t mastra-test:latest .
   ```

2. **Run container**:
   ```bash
   docker run -p 4000:4000 --env-file .env mastra-test:latest
   ```

## Docker Configuration

### Multi-Stage Build

The Dockerfile implements a secure multi-stage build process:

```dockerfile
# Stage 1: Dependencies (deps)
FROM node:20-alpine AS deps
# Installs dependencies with git support for private repos

# Stage 2: Builder (builder)
FROM base AS builder
# Builds the application and generates Prisma client

# Stage 3: Runtime (runner)
FROM base AS runner
# Minimal production image with non-root user
```

### Key Features

- **Security**: Non-root user (`mastra:1001`)
- **Optimization**: Multi-stage builds reduce image size
- **Health checks**: Built-in health endpoint monitoring
- **Git dependencies**: Support for private GitHub repositories
- **Build arguments**: Configurable build-time variables

### Build Commands

```bash
# Standard build
docker build -t mastra-test:latest .

# Build with GitHub token for private dependencies
echo "your-github-token" | docker build --secret id=github_token,src=- -t mastra-test:latest .

# Build with debug tools
docker build --build-arg INCLUDE_DEBUG_TOOLS=true -t mastra-test:debug .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t mastra-test:latest .
```

## Deployment

### GitHub Actions CI/CD

The project includes a comprehensive GitHub Actions workflow (`.github/workflows/deploy.yml`) with:

#### Workflow Triggers

- **Manual dispatch**: Deploy specific environments on demand
- **Push to main**: Automatic deployment of development environment

#### Pipeline Stages

1. **Security Scan**:
   - Dependency vulnerability scanning with Trivy
   - SARIF results uploaded to GitHub Security tab

2. **Build**:
   - Multi-platform Docker image builds
   - Automated tagging and registry push
   - Build cache optimization

3. **Deploy**:
   - Environment-specific deployments
   - SSH-based secure deployment
   - Container health verification

4. **Post-Deploy Security**:
   - Deployed image vulnerability scanning
   - Security monitoring setup

### Required Secrets and Variables

#### GitHub Secrets

```
DEPLOY_SSH_KEY          # SSH private key for server access
GITHUB_TOKEN           # Auto-provided for registry access
```

#### GitHub Variables

```
CONTAINER_REGISTRY     # Registry URL (default: ghcr.io)
DEV_DEPLOY_HOST       # Development server hostname
PROD_DEPLOY_HOST      # Production server hostname
DEPLOY_USER           # SSH username (default: ec2-user)
```

### Manual Deployment

```bash
# Deploy to development
gh workflow run deploy.yml -f environment=development

# Deploy to production
gh workflow run deploy.yml -f environment=production
```

### Server Setup

1. **Install Docker on deployment servers**:

   ```bash
   # Amazon Linux 2
   sudo yum update -y
   sudo yum install -y docker
   sudo systemctl start docker
   sudo systemctl enable docker
   sudo usermod -a -G docker ec2-user
   ```

2. **Create environment directories**:

   ```bash
   sudo mkdir -p /opt/mastra-test
   sudo chown $USER:$USER /opt/mastra-test
   ```

3. **Setup environment files**:
   ```bash
   # Create /opt/mastra-test/.env.development
   # Create /opt/mastra-test/.env.production
   ```

## Security

### Implemented Security Features

#### Container Security

- **Non-root execution**: Application runs as dedicated user
- **Minimal attack surface**: Alpine Linux base with minimal packages
- **Vulnerability scanning**: Automated security scanning with Trivy
- **Health monitoring**: Built-in health checks for early issue detection

#### CI/CD Security

- **Secret management**: GitHub secrets for sensitive data
- **Access controls**: SSH key-based authentication
- **Audit trails**: All deployments logged and tracked
- **Rollback capability**: Automatic rollback on health check failures

#### Environment Security

- **Environment isolation**: Separate configurations for dev/prod
- **Secrets exclusion**: All sensitive data excluded from version control
- **Network isolation**: Docker networks for service communication

### Security Scanning

#### Automated Scanning

- **Pre-deployment**: Dependencies and filesystem scanning
- **Post-deployment**: Container image vulnerability assessment
- **Continuous monitoring**: Regular security updates via Dependabot

#### Manual Security Checks

```bash
# Scan dependencies
pnpm audit

# Scan Docker image locally
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy:latest image mastra-test:latest

# Scan filesystem
trivy fs .
```

### Security Best Practices

1. **Keep dependencies updated**:

   ```bash
   pnpm update
   pnpm audit fix
   ```

2. **Regular security reviews**:
   - Monitor GitHub Security tab
   - Review Trivy scan results
   - Update base images regularly

3. **Access control**:
   - Limit SSH access to deployment servers
   - Use principle of least privilege
   - Regular key rotation

## Environment Configuration

### Environment Files

#### `.env.example` (Template)

```bash
# Application
NODE_ENV=development
LOG_LEVEL=debug
PORT=4000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/mastra_db

# Mastra Configuration
MASTRA_API_KEY=your-api-key
```

#### Development (`.env.development`)

```bash
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://dev_user:dev_pass@dev-db:5432/mastra_dev
```

#### Production (`.env.production`)

```bash
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=postgresql://prod_user:prod_pass@prod-db:5432/mastra_prod
```

### Configuration Management

- **Local**: Copy `.env.example` to `.env` and customize
- **Docker**: Use `--env-file` or `-e` flags
- **CI/CD**: Environment-specific files on deployment servers
- **Secrets**: Use GitHub secrets for sensitive values

## Development

### Available Scripts

```bash
# Development
pnpm dev              # Start development server (port 4000)
pnpm build            # Build the application

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix ESLint issues
pnpm format           # Format code with Prettier
pnpm format:check     # Check code formatting
pnpm type-check       # TypeScript type checking
pnpm check-all        # Run all checks

# Database
pnpm prisma:generate  # Generate Prisma client
```

### Development Workflow

1. **Setup**:

   ```bash
   pnpm install
   cp .env.example .env
   pnpm prisma:generate
   ```

2. **Development**:

   ```bash
   pnpm dev
   ```

3. **Testing**:

   ```bash
   pnpm check-all
   ```

4. **Docker Testing**:
   ```bash
   docker build -t mastra-test:dev .
   docker run -p 4000:4000 --env-file .env mastra-test:dev
   ```

### Project Structure

```
mastra-test/
├── .github/workflows/    # CI/CD workflows
├── src/                  # Application source code
├── prompts/             # Mastra prompts
├── Dockerfile           # Production Docker configuration
├── .dockerignore        # Docker build exclusions
├── .env.example         # Environment template
├── package.json         # Dependencies and scripts
└── README.md           # This file
```

## Troubleshooting

### Common Issues

#### Build Issues

```bash
# Clear build cache
docker builder prune

# Rebuild without cache
docker build --no-cache -t mastra-test:latest .

# Check build logs
docker build -t mastra-test:latest . 2>&1 | tee build.log
```

#### Deployment Issues

```bash
# Check container logs
docker logs mastra-test

# Check container status
docker ps -a

# Test health endpoint
curl -f http://localhost:4000/health
```

#### Permission Issues

```bash
# Fix file permissions
sudo chown -R $(id -u):$(id -g) .

# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock
```

### Health Monitoring

#### Health Check Endpoint

```bash
# Local health check
curl http://localhost:4000/health

# Docker container health
docker inspect mastra-test --format='{{.State.Health.Status}}'
```

#### Log Monitoring

```bash
# Follow application logs
docker logs -f mastra-test

# Check system logs
journalctl -u docker -f
```

### Performance Monitoring

#### Resource Usage

```bash
# Container resource usage
docker stats mastra-test

# System resource usage
top
htop
```

#### Application Metrics

- Monitor response times
- Track error rates
- Database connection health
- Memory usage patterns

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following the coding standards
4. Run all checks: `pnpm check-all`
5. Test Docker build: `docker build -t test .`
6. Submit a pull request

## License

[Add your license information here]

---

For additional support or questions, please create an issue in the GitHub repository.
