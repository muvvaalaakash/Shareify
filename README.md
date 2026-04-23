# Shareify – Community Resource Sharing Platform

Shareify is a peer-to-peer platform where users can act as both owners and renters, sharing and renting items. Built with Python FastAPI, this microservices-based system runs on Docker and Kubernetes.

## Services Overview

1. **User Service** (`:8001`): Handles user registration, login, and profiles.
2. **Item Service** (`:8002`): Manages items added by users.
3. **Inventory Service** (`:8003`): Tracks availability and reservations of items.
4. **Booking Service** (`:8004`): Orchestrates bookings, checking inventory and processing mock payments.
5. **Payment Service** (`:8005`): Simulates payment processing.
6. **Review Service** (`:8006`): Handles user reviews for items.
7. **API Gateway** (`:8000`): Central entry point routing to downstream services.

## Running Locally (Docker Compose)

```bash
# Build and start all services
docker-compose up --build

# Stop all services
docker-compose down
```

## Testing Endpoints (via API Gateway)

### 1. Register a User
```bash
curl -X POST http://localhost:8000/api/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com", "password": "password123"}'
```

### 2. Login
```bash
curl -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email": "alice@example.com", "password": "password123"}'
```
*Extract the `access_token` from the response to use in subsequent requests.*
*Assume the token is saved in a variable: `export TOKEN="your_jwt_token"`*

### 3. Add an Item (as Owner)
```bash
curl -X POST http://localhost:8000/api/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Power Drill", "category": "Tools", "price_per_day": 15.0}'
```
*Note the `item_id` returned.*

### 4. Get all Items
```bash
curl -X GET http://localhost:8000/api/items
```

### 5. Book an Item (as Renter)
*Note: Register and login as a DIFFERENT user (e.g., Bob) to book Alice's item.*
```bash
curl -X POST http://localhost:8000/api/bookings \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"item_id": "<ITEM_ID>", "start_date": "2024-12-01", "end_date": "2024-12-05"}'
```

### 6. Add a Review
```bash
curl -X POST http://localhost:8000/api/reviews \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"item_id": "<ITEM_ID>", "rating": 5, "comment": "Great drill, worked perfectly!"}'
```

### 7. Get Reviews for an Item
```bash
curl -X GET "http://localhost:8000/api/reviews?item_id=<ITEM_ID>"
```

## Kubernetes Deployment

```bash
# Apply all manifests
kubectl apply -f k8s/

# Get services
kubectl get svc
```
*The API Gateway will be exposed as a NodePort on port 30080.*
