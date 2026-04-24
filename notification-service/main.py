"""
Shareify Notification Service
- Send email notifications (Mock)
"""

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, EmailStr

app = FastAPI(title="Shareify Notification Service", version="1.0.0")

class EmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str

@app.post("/send-email")
def send_email(request: EmailRequest):
    print(f"--- [MOCK EMAIL SENT] ---")
    print(f"To: {request.to_email}")
    print(f"Subject: {request.subject}")
    print(f"Body: {request.body}")
    print(f"-------------------------")
    return {"message": "Email sent successfully (mocked)"}

@app.get("/health")
def health():
    return {"status": "healthy", "service": "shareify-notification-service"}
