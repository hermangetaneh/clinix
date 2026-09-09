"""Clinix Flask API.

This backend is intentionally kept separate from the preview adapter in
artifacts/api-server. It is ready to run as the standalone Python deployment
described in the product brief:

  pip install -r requirements.txt
  flask --app app init-db
  flask --app app run
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, jsonify, request, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import or_
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'clinix.db'}")

db = SQLAlchemy()


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(60), nullable=False, default="Administrator")


class Patient(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.String(30), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    age = db.Column(db.Integer, nullable=False)
    gender = db.Column(db.String(30), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    address = db.Column(db.Text, default="")
    status = db.Column(db.String(30), nullable=False, default="Active")
    last_visit = db.Column(db.String(10))
    registered_at = db.Column(db.String(10), nullable=False)
    emergency_contact = db.Column(db.Text)


class Doctor(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    specialty = db.Column(db.String(100), nullable=False)
    department = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    availability = db.Column(db.String(80), default="Mon – Fri, 09:00 – 17:00")
    status = db.Column(db.String(40), default="Available")


class Appointment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False)
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctor.id"), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    time = db.Column(db.String(20), nullable=False)
    reason = db.Column(db.String(180), nullable=False)
    department = db.Column(db.String(100), nullable=False)
    notes = db.Column(db.Text)
    status = db.Column(db.String(30), nullable=False, default="Scheduled")
    patient = db.relationship("Patient")
    doctor = db.relationship("Doctor")


class MedicalRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False)
    doctor_id = db.Column(db.Integer, db.ForeignKey("doctor.id"), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    diagnosis = db.Column(db.String(180), nullable=False)
    symptoms = db.Column(db.Text, nullable=False)
    treatment = db.Column(db.Text, nullable=False)
    notes = db.Column(db.Text)
    follow_up = db.Column(db.Text)
    patient = db.relationship("Patient")
    doctor = db.relationship("Doctor")


class Invoice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    invoice_id = db.Column(db.String(30), unique=True, nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey("patient.id"), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    due_date = db.Column(db.String(10), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    status = db.Column(db.String(30), default="Pending")
    service = db.Column(db.String(180), nullable=False)
    payment_method = db.Column(db.String(60))
    patient = db.relationship("Patient")


class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(140), nullable=False)
    description = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(40), nullable=False)
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Settings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    organization_name = db.Column(db.String(160), nullable=False)
    phone = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    address = db.Column(db.Text, nullable=False)
    appearance = db.Column(db.String(20), default="light")
    appointment_notifications = db.Column(db.Boolean, default=True)
    billing_notifications = db.Column(db.Boolean, default=True)
    system_notifications = db.Column(db.Boolean, default=True)


def create_app(config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY", os.getenv("SESSION_SECRET", "clinix-dev-only")),
        SQLALCHEMY_DATABASE_URI=DATABASE_URL,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )
    if config:
        app.config.update(config)
    db.init_app(app)
    CORS(app, supports_credentials=True, origins=os.getenv("CORS_ORIGINS", "*").split(","))

    with app.app_context():
        db.create_all()
        seed_demo_data()

    @app.cli.command("init-db")
    def init_db_command() -> None:
        db.create_all()
        print("Initialized Clinix database.")

    @app.errorhandler(400)
    def bad_request(_: Any):
        return jsonify(success=False, message="The request could not be understood."), 400

    @app.errorhandler(404)
    def not_found(_: Any):
        return jsonify(success=False, message="The requested resource was not found."), 404

    @app.errorhandler(500)
    def server_error(_: Any):
        db.session.rollback()
        return jsonify(success=False, message="Something went wrong. Please try again."), 500

    register_routes(app)
    return app


def signed_in(handler: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(handler)
    def wrapped(*args: Any, **kwargs: Any):
        if not session.get("user_id"):
            return jsonify(success=False, message="Please sign in to continue."), 401
        return handler(*args, **kwargs)

    return wrapped


def today_string() -> str:
    return date.today().isoformat()


def patient_json(row: Patient) -> dict[str, Any]:
    return {
        "id": row.id,
        "patientId": row.patient_id,
        "name": row.name,
        "age": row.age,
        "gender": row.gender,
        "phone": row.phone,
        "email": row.email,
        "address": row.address,
        "status": row.status,
        "lastVisit": row.last_visit,
        "registeredAt": row.registered_at,
        "emergencyContact": row.emergency_contact,
    }


def doctor_json(row: Doctor) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "specialty": row.specialty,
        "department": row.department,
        "phone": row.phone,
        "email": row.email,
        "availability": row.availability,
        "status": row.status,
        "initials": "".join(part[0] for part in row.name.split())[:2].upper(),
    }


def appointment_json(row: Appointment) -> dict[str, Any]:
    return {
        "id": row.id,
        "patientId": row.patient_id,
        "patientName": row.patient.name,
        "doctorId": row.doctor_id,
        "doctorName": row.doctor.name,
        "date": row.date,
        "time": row.time,
        "reason": row.reason,
        "department": row.department,
        "notes": row.notes,
        "status": row.status,
    }


def record_json(row: MedicalRecord) -> dict[str, Any]:
    return {
        "id": row.id,
        "patientId": row.patient_id,
        "patientName": row.patient.name,
        "doctorId": row.doctor_id,
        "doctorName": row.doctor.name,
        "date": row.date,
        "diagnosis": row.diagnosis,
        "symptoms": row.symptoms,
        "treatment": row.treatment,
        "notes": row.notes,
        "followUp": row.follow_up,
    }


def invoice_json(row: Invoice) -> dict[str, Any]:
    return {
        "id": row.id,
        "invoiceId": row.invoice_id,
        "patientId": row.patient_id,
        "patientName": row.patient.name,
        "date": row.date,
        "dueDate": row.due_date,
        "amount": float(row.amount),
        "status": row.status,
        "service": row.service,
        "paymentMethod": row.payment_method,
    }


def user_json(row: User) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "email": row.email,
        "role": row.role,
        "initials": "".join(part[0] for part in row.name.split())[:2].upper(),
    }


def register_routes(app: Flask) -> None:
    @app.get("/api/healthz")
    def health() -> Any:
        return jsonify(status="ok")

    @app.post("/api/auth/login")
    def login() -> Any:
        body = request.get_json(silent=True) or {}
        user = User.query.filter_by(email=str(body.get("email", "")).lower()).first()
        if not user or not check_password_hash(user.password_hash, str(body.get("password", ""))):
            return jsonify(success=False, message="Those credentials don’t match our records."), 401
        session["user_id"] = user.id
        return jsonify(user=user_json(user))

    @app.post("/api/auth/register")
    def register() -> Any:
        body = request.get_json(silent=True) or {}
        email = str(body.get("email", "")).lower()
        if not body.get("name") or not email or not body.get("password"):
            return jsonify(success=False, message="Complete all registration fields."), 422
        if User.query.filter_by(email=email).first():
            return jsonify(success=False, message="An account with that email already exists."), 409
        user = User(name=body["name"], email=email, role=body.get("role", "Administrator"), password_hash=generate_password_hash(body["password"]))
        db.session.add(user)
        db.session.commit()
        session["user_id"] = user.id
        return jsonify(user=user_json(user)), 201

    @app.post("/api/auth/logout")
    def logout() -> Any:
        session.clear()
        return "", 204

    @app.get("/api/auth/me")
    @signed_in
    def me() -> Any:
        user = db.session.get(User, session["user_id"])
        return jsonify(user_json(user))

    @app.get("/api/patients")
    @signed_in
    def patients() -> Any:
        query = Patient.query
        search = request.args.get("search", "").strip()
        status = request.args.get("status")
        if search:
            like = f"%{search}%"
            query = query.filter(or_(Patient.name.ilike(like), Patient.patient_id.ilike(like), Patient.email.ilike(like)))
        if status:
            query = query.filter_by(status=status)
        return jsonify([patient_json(row) for row in query.order_by(Patient.id.desc()).all()])

    @app.post("/api/patients")
    @signed_in
    def create_patient() -> Any:
        body = request.get_json(silent=True) or {}
        required = ["name", "age", "gender", "phone", "email"]
        if any(not body.get(key) for key in required):
            return jsonify(success=False, message="Check the patient details and try again."), 422
        row = Patient(patient_id=f"P-{1000 + Patient.query.count() + 1}", registered_at=today_string(), **{key: body.get(key) for key in ["name", "age", "gender", "phone", "email", "address", "status", "emergency_contact"]})
        db.session.add(row)
        db.session.commit()
        return jsonify(patient_json(row)), 201

    @app.route("/api/patients/<int:patient_id>", methods=["GET", "PUT", "DELETE"])
    @signed_in
    def patient_detail(patient_id: int) -> Any:
        row = db.get_or_404(Patient, patient_id)
        if request.method == "GET":
            return jsonify(patient_json(row))
        if request.method == "DELETE":
            db.session.delete(row)
            db.session.commit()
            return "", 204
        body = request.get_json(silent=True) or {}
        for key in ["name", "age", "gender", "phone", "email", "address", "status", "emergency_contact"]:
            if key in body:
                setattr(row, key, body[key])
        db.session.commit()
        return jsonify(patient_json(row))

    @app.get("/api/doctors")
    @signed_in
    def doctors() -> Any:
        query = Doctor.query
        search = request.args.get("search", "").strip()
        if search:
            like = f"%{search}%"
            query = query.filter(or_(Doctor.name.ilike(like), Doctor.specialty.ilike(like), Doctor.department.ilike(like)))
        return jsonify([doctor_json(row) for row in query.order_by(Doctor.name).all()])

    @app.post("/api/doctors")
    @signed_in
    def create_doctor() -> Any:
        body = request.get_json(silent=True) or {}
        row = Doctor(**{key: body.get(key, "") for key in ["name", "specialty", "department", "phone", "email", "availability", "status"]})
        db.session.add(row)
        db.session.commit()
        return jsonify(doctor_json(row)), 201

    @app.get("/api/appointments")
    @signed_in
    def appointments() -> Any:
        query = Appointment.query
        if request.args.get("date"):
            query = query.filter_by(date=request.args["date"])
        rows = query.order_by(Appointment.date, Appointment.time).all()
        return jsonify([appointment_json(row) for row in rows])

    @app.post("/api/appointments")
    @signed_in
    def create_appointment() -> Any:
        body = request.get_json(silent=True) or {}
        conflict = Appointment.query.filter_by(doctor_id=body.get("doctorId"), date=body.get("date"), time=body.get("time")).first()
        if conflict:
            return jsonify(success=False, message="That doctor already has an appointment at this time."), 409
        row = Appointment(patient_id=body["patientId"], doctor_id=body["doctorId"], date=body["date"], time=body["time"], reason=body["reason"], department=body["department"], notes=body.get("notes"), status=body.get("status", "Scheduled"))
        db.session.add(row)
        db.session.commit()
        return jsonify(appointment_json(row)), 201

    @app.get("/api/records")
    @signed_in
    def records() -> Any:
        return jsonify([record_json(row) for row in MedicalRecord.query.order_by(MedicalRecord.date.desc()).all()])

    @app.post("/api/records")
    @signed_in
    def create_record() -> Any:
        body = request.get_json(silent=True) or {}
        row = MedicalRecord(patient_id=body["patientId"], doctor_id=body["doctorId"], date=body["date"], diagnosis=body["diagnosis"], symptoms=body["symptoms"], treatment=body["treatment"], notes=body.get("notes"), follow_up=body.get("followUp"))
        db.session.add(row)
        db.session.commit()
        return jsonify(record_json(row)), 201

    @app.get("/api/invoices")
    @signed_in
    def invoices() -> Any:
        return jsonify([invoice_json(row) for row in Invoice.query.order_by(Invoice.date.desc()).all()])

    @app.post("/api/invoices")
    @signed_in
    def create_invoice() -> Any:
        body = request.get_json(silent=True) or {}
        row = Invoice(invoice_id=f"INV-{2000 + Invoice.query.count() + 1}", patient_id=body["patientId"], date=body["date"], due_date=body["dueDate"], amount=body["amount"], status=body.get("status", "Pending"), service=body["service"], payment_method=body.get("paymentMethod"))
        db.session.add(row)
        db.session.commit()
        return jsonify(invoice_json(row)), 201

    @app.get("/api/dashboard")
    @signed_in
    def dashboard() -> Any:
        today = today_string()
        current_appointments = Appointment.query.filter_by(date=today).order_by(Appointment.time).all()
        paid = sum(float(row.amount) for row in Invoice.query.filter_by(status="Paid").all())
        status_counts = [{"status": status, "count": Appointment.query.filter_by(status=status).count()} for status in ["Scheduled", "Confirmed", "Completed", "Cancelled", "No-show"]]
        return jsonify(
            stats={"patients": Patient.query.count(), "doctors": Doctor.query.count(), "appointments": len(current_appointments), "revenue": paid},
            appointmentStatus=status_counts,
            appointments=[appointment_json(row) for row in current_appointments],
            activity=[{"id": row.id, "title": row.title, "description": row.description, "time": row.created_at.isoformat(), "type": row.type} for row in Notification.query.order_by(Notification.created_at.desc()).limit(5)],
            patientTrend=[],
            revenueTrend=[],
        )

    @app.get("/api/analytics")
    @signed_in
    def analytics() -> Any:
        appointments = Appointment.query.all()
        departments = sorted({row.department for row in appointments})
        return jsonify(
            patientGrowth=[],
            appointmentVolume=[],
            revenue=[],
            departmentPerformance=[{"department": department, "appointments": sum(row.department == department for row in appointments), "completed": sum(row.department == department and row.status == "Completed" for row in appointments)} for department in departments],
            statusBreakdown=[{"status": status, "value": sum(row.status == status for row in appointments)} for status in ["Scheduled", "Confirmed", "Completed", "Cancelled", "No-show"]],
        )

    @app.get("/api/notifications")
    @signed_in
    def notifications() -> Any:
        return jsonify([{"id": row.id, "title": row.title, "description": row.description, "time": row.created_at.isoformat(), "read": row.read, "type": row.type} for row in Notification.query.order_by(Notification.created_at.desc()).all()])

    @app.post("/api/notifications/<int:notification_id>/read")
    @signed_in
    def mark_notification_read(notification_id: int) -> Any:
        row = db.get_or_404(Notification, notification_id)
        row.read = True
        db.session.commit()
        return "", 204

    @app.get("/api/settings")
    @signed_in
    def settings() -> Any:
        row = Settings.query.first()
        return jsonify(settings_json(row))

    @app.put("/api/settings")
    @signed_in
    def update_settings() -> Any:
        row = Settings.query.first()
        body = request.get_json(silent=True) or {}
        row.organization_name = body.get("organizationName", row.organization_name)
        row.phone = body.get("phone", row.phone)
        row.email = body.get("email", row.email)
        row.address = body.get("address", row.address)
        row.appearance = body.get("appearance", row.appearance)
        notifications = body.get("notifications", {})
        row.appointment_notifications = notifications.get("appointments", row.appointment_notifications)
        row.billing_notifications = notifications.get("billing", row.billing_notifications)
        row.system_notifications = notifications.get("system", row.system_notifications)
        db.session.commit()
        return jsonify(settings_json(row))


def settings_json(row: Settings) -> dict[str, Any]:
    return {
        "organizationName": row.organization_name,
        "phone": row.phone,
        "email": row.email,
        "address": row.address,
        "appearance": row.appearance,
        "notifications": {
            "appointments": row.appointment_notifications,
            "billing": row.billing_notifications,
            "system": row.system_notifications,
        },
    }


def seed_demo_data() -> None:
    if User.query.first():
        return
    admin = User(name="Maya Thompson", email="demo@clinix.health", password_hash=generate_password_hash("clinixdemo"), role="Administrator")
    patients = [
        Patient(patient_id="P-1024", name="Amina Hassan", age=34, gender="Female", phone="+251 911 204 881", email="amina.hassan@example.com", address="Bole, Addis Ababa", status="Active", registered_at=(date.today() - timedelta(days=60)).isoformat()),
        Patient(patient_id="P-1025", name="Jonas Meyer", age=48, gender="Male", phone="+49 171 332 901", email="jonas.meyer@example.com", address="Kirkos, Addis Ababa", status="Active", registered_at=(date.today() - timedelta(days=45)).isoformat()),
    ]
    doctors = [
        Doctor(name="Dr. Daniel Morgan", specialty="Cardiology", department="Heart & Vascular", phone="+251 911 453 001", email="daniel.morgan@clinix.health"),
        Doctor(name="Dr. Sofia Alvarez", specialty="Pediatrics", department="Children's Health", phone="+251 911 453 002", email="sofia.alvarez@clinix.health"),
    ]
    db.session.add_all([admin, *patients, *doctors])
    db.session.flush()
    db.session.add_all([
        Appointment(patient_id=patients[0].id, doctor_id=doctors[0].id, date=today_string(), time="09:30", reason="Routine cardiovascular review", department="Heart & Vascular", status="Confirmed"),
        Invoice(invoice_id="INV-2048", patient_id=patients[0].id, date=today_string(), due_date=(date.today() + timedelta(days=30)).isoformat(), amount=420, service="Cardiology consultation", status="Paid", payment_method="Card"),
        Notification(title="Appointment confirmed", description="Amina Hassan is confirmed for today at 09:30.", type="appointment"),
    ])
    db.session.add(Settings(organization_name="Clinix Health Centre", phone="+251 11 467 2300", email="hello@clinix.health", address="22 Atlas Avenue, Addis Ababa"))
    db.session.commit()


app = create_app()