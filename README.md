# Stockroom Product CRUD

Angular frontend and Spring Boot REST API for creating, viewing, editing, and deleting products.

## Requirements

- Node.js 20.19+ (or 22.12+)
- Java 8 or later (JDK)

## Run the API

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

The API is available at `http://localhost:8080/api/products`. It uses an in-memory H2 database, so data is reset when the server restarts. The H2 console is at `http://localhost:8080/h2-console`.

## Run the Angular app

In another terminal:

```powershell
cd frontend
npm install
npm start
```

Open `http://localhost:4200`. The Angular development server connects to the API on port 8080.
