# Document Management System - ECS + EFS

Simple document management application demonstrating ECS Fargate with EFS persistent storage.

## 🚀 Quick Start

### Run Locally
```bash
npm install
npm run dev
```
Visit: http://localhost:3000



## Features
- Upload files to EFS storage
- Persistent storage across container restarts
- Simple web interface
- RESTful API

## Local Development
- Files stored in `./local-efs/uploads/`
- Auto-restart with nodemon
- Environment variables in `.env`

## ECS Deployment
- Single zone deployment for cost optimization
- EFS for persistent file storage
- Application Load Balancer
- Auto-scaling ready



That's it! Simple and effective ECS + EFS integration.
