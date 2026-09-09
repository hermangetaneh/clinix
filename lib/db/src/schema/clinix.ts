import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "clinix_users",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 60 }).notNull().default("Administrator"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ emailIdx: uniqueIndex("clinix_users_email_idx").on(table.email) }),
);

export const patientsTable = pgTable("clinix_patients", {
  id: serial("id").primaryKey(),
  patientId: varchar("patient_id", { length: 30 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  age: integer("age").notNull(),
  gender: varchar("gender", { length: 30 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  address: text("address").notNull().default(""),
  status: varchar("status", { length: 30 }).notNull().default("Active"),
  lastVisit: date("last_visit", { mode: "string" }),
  registeredAt: date("registered_at", { mode: "string" }).notNull(),
  emergencyContact: text("emergency_contact"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const doctorsTable = pgTable("clinix_doctors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  specialty: varchar("specialty", { length: 100 }).notNull(),
  department: varchar("department", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  availability: varchar("availability", { length: 80 }).notNull().default("Mon – Fri, 09:00 – 17:00"),
  status: varchar("status", { length: 40 }).notNull().default("Available"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointmentsTable = pgTable("clinix_appointments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull(),
  doctorId: integer("doctor_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  time: varchar("time", { length: 20 }).notNull(),
  reason: varchar("reason", { length: 180 }).notNull(),
  department: varchar("department", { length: 100 }).notNull(),
  notes: text("notes"),
  status: varchar("status", { length: 30 }).notNull().default("Scheduled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medicalRecordsTable = pgTable("clinix_medical_records", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").notNull(),
  doctorId: integer("doctor_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  diagnosis: varchar("diagnosis", { length: 180 }).notNull(),
  symptoms: text("symptoms").notNull(),
  treatment: text("treatment").notNull(),
  notes: text("notes"),
  followUp: text("follow_up"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoicesTable = pgTable("clinix_invoices", {
  id: serial("id").primaryKey(),
  invoiceId: varchar("invoice_id", { length: 30 }).notNull(),
  patientId: integer("patient_id").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 30 }).notNull().default("Pending"),
  service: varchar("service", { length: 180 }).notNull(),
  paymentMethod: varchar("payment_method", { length: 60 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationsTable = pgTable("clinix_notifications", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 140 }).notNull(),
  description: text("description").notNull(),
  type: varchar("type", { length: 40 }).notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settingsTable = pgTable("clinix_settings", {
  id: serial("id").primaryKey(),
  organizationName: varchar("organization_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  address: text("address").notNull(),
  appearance: varchar("appearance", { length: 20 }).notNull().default("light"),
  appointmentNotifications: boolean("appointment_notifications").notNull().default(true),
  billingNotifications: boolean("billing_notifications").notNull().default(true),
  systemNotifications: boolean("system_notifications").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({ id: true, createdAt: true });
export const insertDoctorSchema = createInsertSchema(doctorsTable).omit({ id: true, createdAt: true });
export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({ id: true, createdAt: true });
export const insertMedicalRecordSchema = createInsertSchema(medicalRecordsTable).omit({ id: true, createdAt: true });
export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true });

export type PatientRow = typeof patientsTable.$inferSelect;
export type DoctorRow = typeof doctorsTable.$inferSelect;
export type AppointmentRow = typeof appointmentsTable.$inferSelect;
export type MedicalRecordRow = typeof medicalRecordsTable.$inferSelect;
export type InvoiceRow = typeof invoicesTable.$inferSelect;
export type NewPatient = z.infer<typeof insertPatientSchema>;
export type NewDoctor = z.infer<typeof insertDoctorSchema>;
export type NewAppointment = z.infer<typeof insertAppointmentSchema>;
export type NewMedicalRecord = z.infer<typeof insertMedicalRecordSchema>;
export type NewInvoice = z.infer<typeof insertInvoiceSchema>;