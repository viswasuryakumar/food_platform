# 🍔 Food Ordering Platform

> A scalable, microservices-based full-stack application for efficient digital food ordering, real-time tracking, and intelligent recommendations.

---

## 📌 1. Problem Statement

In modern environments such as workplaces, educational institutions, and public food courts, users frequently encounter inefficiencies in food ordering systems. These challenges include:

- Long waiting times due to physical queues
- Lack of a centralized platform to browse multiple vendors
- Limited visibility into menu availability and order status
- Inefficient communication between users and service providers

These issues result in poor user experience, time inefficiencies, and reduced operational effectiveness.

---

## 💡 2. Proposed Solution

The **Food Ordering Platform** provides a centralized, scalable, and user-friendly system that digitizes and optimizes the food ordering workflow.

The platform enables users to:

- Browse restaurants and menus in real time
- Place and manage orders digitally
- Track order status dynamically
- Perform seamless payment transactions

Additionally, the system supports an optional **AI-powered recommendation engine** to enhance search, personalization, and user experience.

---
## 🏗️ 3. System Architecture Overview
The platform follows a **microservices architecture** combined with an **API Gateway pattern**, ensuring modularity, scalability, and maintainability.

🔄 Request Flow

User interacts with the Frontend UI.

Requests are sent to the API Gateway.

The gateway routes requests to appropriate microservices.

Services interact with MongoDB for data persistence.

Responses are returned via the gateway to the frontend.

AI module (if enabled) enhances search and recommendations.

## 🧩 4. Project Structure
food_platform/
|
|-- api-gateway/        # Central routing and orchestration layer
|-- services/           # Independent backend microservices
|-- frontend/           # React-based user interface
|-- scripts/            # Setup, database, and seeding utilities
|-- package.json        # Root-level scripts and configuration
`-- .env                # Environment variables
## ⚙️ 5. Technology Stack
Backend

Node.js

Express.js

RESTful APIs

Frontend

React.js

Vite

Database

MongoDB (NoSQL)

Architecture

Microservices architecture

API Gateway pattern

AI Integration (Optional)

OpenAI-based recommendation system

## 🚀 6. Features

Centralized restaurant browsing

Real-time menu exploration

Order placement and tracking

Payment simulation

Admin-level controls

AI-powered intelligent search (optional)

## 📋 7. Prerequisites

Ensure the following are installed:

Node.js (v16 or higher)

MongoDB (running locally)

## ▶️ 8. Installation & Setup
Step 1: Clone Repository
git clone https://github.com/viswasuryakumar/food_platform.git
cd food_platform
Step 2: Start MongoDB
macOS
brew services start mongodb-community
Windows
net start MongoDB
Step 3: Install Dependencies
npm run setup
Step 4: Seed Database
npm run seed
Step 5: Start Application
npm run dev
🌐 Access Points

Frontend: http://localhost:5173

API Gateway: http://localhost:3000

## 🤖 9. AI Configuration (Optional)

Update the following file:

api-gateway/.env

Add:

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

Restart the application after updating.

## ⚡ 10. Quick Commands
Command	Description
npm run setup	Install dependencies and generate .env files
npm run db:start	Start MongoDB locally
npm run dev	Run all services and frontend
npm run setup:run	Setup and run in one command
npm run seed	Insert demo data
npm run seed:reset	Reset and reseed database

## ⚠️ 11. Limitations

Limited production-grade error handling

## 🔮 12. Future Enhancements

Cloud deployment (AWS EC2 + Load Balancer)

Integration with real payment systems (Stripe)

Notification system (Email/SMS)

Advanced AI-driven recommendations

## 👥 13. Team

Team Name: Team 4 - Mitochondria

Viswa Surya Kumar Suvvada

Girith Choudary

Anil Kumar Bandaru

Harsha Vardhan Badithaboina

Sanjushree Golla

## 📌 14. Conclusion

This project demonstrates the design and implementation of a modern, scalable food ordering system using microservices architecture. It integrates full-stack development principles with optional AI capabilities, making it suitable for real-world applications and future enhancements.
