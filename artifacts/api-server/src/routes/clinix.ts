import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  LoginBody,
  RegisterBody,
  CreatePatientBody,
  UpdatePatientBody,
  CreateDoctorBody,
  UpdateDoctorBody,
  CreateAppointmentBody,
  UpdateAppointmentBody,
  CreateMedicalRecordBody,
  UpdateMedicalRecordBody,
  CreateInvoiceBody,
  UpdateInvoiceBody,
  UpdateSettingsBody,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  appointmentsTable,
  doctorsTable,
  invoicesTable,
  medicalRecordsTable,
  notificationsTable,
  patientsTable,
  settingsTable,
  usersTable,
} from "@workspace/db";

const router: IRouter = Router();
const sessions = new Map<string, number>();
let seedPromise: Promise<void> | undefined;

const today = new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function asUser(user: { id: number; name: string; email: string; role: string }) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, initials: initials(user.name) };
}

function authUser(req: Request) {
  const sessionId = req.cookies?.clinix_session as string | undefined;
  const userId = sessionId ? sessions.get(sessionId) : undefined;
  return userId;
}

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!authUser(req)) {
    res.status(401).json({ message: "Please sign in to continue." });
    return;
  }
  next();
}

function mapPatient(row: typeof patientsTable.$inferSelect) {
  return {
    id: row.id,
    patientId: row.patientId,
    name: row.name,
    age: row.age,
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    address: row.address,
    status: row.status,
    lastVisit: row.lastVisit,
    registeredAt: row.registeredAt,
    emergencyContact: row.emergencyContact,
  };
}

function mapDoctor(row: typeof doctorsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    department: row.department,
    phone: row.phone,
    email: row.email,
    availability: row.availability,
    status: row.status,
    initials: initials(row.name),
  };
}

async function ensureSeeded() {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    if (Number(count) > 0) return;

    const [admin] = await db
      .insert(usersTable)
      .values({
        name: "Maya Thompson",
        email: "demo@clinix.health",
        passwordHash: hashPassword("clinixdemo"),
        role: "Administrator",
      })
      .returning();

    const patients = await db
      .insert(patientsTable)
      .values([
        {
          patientId: "P-1024",
          name: "Amina Hassan",
          age: 34,
          gender: "Female",
          phone: "+251 911 204 881",
          email: "amina.hassan@example.com",
          address: "Bole, Addis Ababa",
          lastVisit: plusDays(-3),
          registeredAt: plusDays(-60),
          emergencyContact: "Khalid Hassan · +251 911 202 110",
        },
        {
          patientId: "P-1025",
          name: "Jonas Meyer",
          age: 48,
          gender: "Male",
          phone: "+49 171 332 901",
          email: "jonas.meyer@example.com",
          address: "Kirkos, Addis Ababa",
          lastVisit: plusDays(-11),
          registeredAt: plusDays(-45),
          emergencyContact: "Lea Meyer · +49 171 332 902",
        },
        {
          patientId: "P-1026",
          name: "Liya Bekele",
          age: 27,
          gender: "Female",
          phone: "+251 922 773 104",
          email: "liya.bekele@example.com",
          address: "Kazanchis, Addis Ababa",
          lastVisit: plusDays(-1),
          registeredAt: plusDays(-26),
          emergencyContact: "Samuel Bekele · +251 922 773 105",
        },
        {
          patientId: "P-1027",
          name: "David Okafor",
          age: 61,
          gender: "Male",
          phone: "+234 803 110 785",
          email: "david.okafor@example.com",
          address: "Yeka, Addis Ababa",
          lastVisit: null,
          registeredAt: plusDays(-14),
          emergencyContact: "Nneka Okafor · +234 803 110 786",
        },
      ])
      .returning();

    const doctors = await db
      .insert(doctorsTable)
      .values([
        {
          name: "Dr. Daniel Morgan",
          specialty: "Cardiology",
          department: "Heart & Vascular",
          phone: "+251 911 453 001",
          email: "daniel.morgan@clinix.health",
          availability: "Mon – Fri, 09:00 – 17:00",
          status: "Available",
        },
        {
          name: "Dr. Sofia Alvarez",
          specialty: "Pediatrics",
          department: "Children's Health",
          phone: "+251 911 453 002",
          email: "sofia.alvarez@clinix.health",
          availability: "Mon – Thu, 08:00 – 15:00",
          status: "In consultation",
        },
        {
          name: "Dr. Elias Chen",
          specialty: "Neurology",
          department: "Neurosciences",
          phone: "+251 911 453 003",
          email: "elias.chen@clinix.health",
          availability: "Tue – Sat, 10:00 – 18:00",
          status: "Available",
        },
      ])
      .returning();

    await db.insert(appointmentsTable).values([
      {
        patientId: patients[0].id,
        doctorId: doctors[0].id,
        date: today,
        time: "09:30",
        reason: "Routine cardiovascular review",
        department: "Heart & Vascular",
        status: "Confirmed",
      },
      {
        patientId: patients[2].id,
        doctorId: doctors[1].id,
        date: today,
        time: "11:00",
        reason: "Annual wellness visit",
        department: "Children's Health",
        status: "Scheduled",
      },
      {
        patientId: patients[1].id,
        doctorId: doctors[2].id,
        date: plusDays(1),
        time: "14:30",
        reason: "Headache assessment",
        department: "Neurosciences",
        status: "Scheduled",
      },
      {
        patientId: patients[3].id,
        doctorId: doctors[0].id,
        date: plusDays(-2),
        time: "15:00",
        reason: "Blood pressure follow-up",
        department: "Heart & Vascular",
        status: "Completed",
      },
    ]);

    await db.insert(medicalRecordsTable).values([
      {
        patientId: patients[0].id,
        doctorId: doctors[0].id,
        date: plusDays(-3),
        diagnosis: "Stable essential hypertension",
        symptoms: "Occasional dizziness after exertion",
        treatment: "Continue medication, reduce sodium intake, monitor BP twice daily.",
        notes: "Patient responding well to current plan.",
        followUp: plusDays(28),
      },
      {
        patientId: patients[2].id,
        doctorId: doctors[1].id,
        date: plusDays(-1),
        diagnosis: "Seasonal allergic rhinitis",
        symptoms: "Sneezing and nasal congestion",
        treatment: "Non-drowsy antihistamine as needed.",
        notes: "Follow up if symptoms persist beyond two weeks.",
        followUp: plusDays(14),
      },
    ]);

    await db.insert(invoicesTable).values([
      {
        invoiceId: "INV-2048",
        patientId: patients[0].id,
        date: plusDays(-3),
        dueDate: plusDays(27),
        amount: "420.00",
        status: "Paid",
        service: "Cardiology consultation",
        paymentMethod: "Card",
      },
      {
        invoiceId: "INV-2049",
        patientId: patients[2].id,
        date: plusDays(-1),
        dueDate: plusDays(29),
        amount: "185.00",
        status: "Pending",
        service: "Pediatrics wellness visit",
        paymentMethod: null,
      },
      {
        invoiceId: "INV-2050",
        patientId: patients[1].id,
        date: plusDays(-12),
        dueDate: plusDays(-2),
        amount: "260.00",
        status: "Overdue",
        service: "Neurology assessment",
        paymentMethod: null,
      },
    ]);

    await db.insert(notificationsTable).values([
      { title: "Appointment confirmed", description: "Amina Hassan is confirmed for today at 09:30.", type: "appointment" },
      { title: "New patient registered", description: "David Okafor was added to the patient directory.", type: "patient" },
      { title: "Invoice payment received", description: "Invoice INV-2048 was marked as paid.", type: "billing", read: true },
    ]);
    await db.insert(settingsTable).values({
      organizationName: "Clinix Health Centre",
      phone: "+251 11 467 2300",
      email: "hello@clinix.health",
      address: "22 Atlas Avenue, Addis Ababa",
      appearance: "light",
    });

    void admin;
  })();
  return seedPromise;
}

async function patientById(id: number) {
  const [row] = await db.select().from(patientsTable).where(eq(patientsTable.id, id));
  return row;
}

async function doctorById(id: number) {
  const [row] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, id));
  return row;
}

async function appointmentView(row: typeof appointmentsTable.$inferSelect) {
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, row.doctorId));
  return {
    ...row,
    patientName: patient?.name ?? "Unknown patient",
    doctorName: doctor?.name ?? "Unknown doctor",
  };
}

async function recordView(row: typeof medicalRecordsTable.$inferSelect) {
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  const [doctor] = await db.select().from(doctorsTable).where(eq(doctorsTable.id, row.doctorId));
  return { ...row, patientName: patient?.name ?? "Unknown patient", doctorName: doctor?.name ?? "Unknown doctor" };
}

async function invoiceView(row: typeof invoicesTable.$inferSelect) {
  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, row.patientId));
  return { ...row, amount: Number(row.amount), patientName: patient?.name ?? "Unknown patient" };
}

router.post("/auth/login", async (req, res) => {
  await ensureSeeded();
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Enter a valid email and password." });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase()));
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return res.status(401).json({ message: "Those credentials don’t match our records." });
  }
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, user.id);
  res.cookie("clinix_session", sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 12 });
  return res.json({ user: asUser(user) });
});

router.post("/auth/register", async (req, res) => {
  await ensureSeeded();
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Complete all registration fields." });
  const email = parsed.data.email.toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) return res.status(409).json({ message: "An account with that email already exists." });
  const [user] = await db
    .insert(usersTable)
    .values({ name: parsed.data.name, email, passwordHash: hashPassword(parsed.data.password), role: parsed.data.role })
    .returning();
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, user.id);
  res.cookie("clinix_session", sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 12 });
  return res.status(201).json({ user: asUser(user) });
});

router.post("/auth/logout", (_req, res) => {
  const sessionId = _req.cookies?.clinix_session as string | undefined;
  if (sessionId) sessions.delete(sessionId);
  res.clearCookie("clinix_session");
  return res.status(204).send();
});

router.get("/auth/me", async (req, res) => {
  await ensureSeeded();
  const userId = authUser(req);
  if (!userId) return res.status(401).json({ message: "Please sign in to continue." });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return res.status(401).json({ message: "Please sign in to continue." });
  return res.json(asUser(user));
});

router.use(requireAuth);

router.get("/dashboard", async (_req, res) => {
  await ensureSeeded();
  const [patientCount] = await db.select({ count: sql<number>`count(*)` }).from(patientsTable);
  const [doctorCount] = await db.select({ count: sql<number>`count(*)` }).from(doctorsTable);
  const [appointmentCount] = await db.select({ count: sql<number>`count(*)` }).from(appointmentsTable).where(eq(appointmentsTable.date, today));
  const [revenue] = await db.select({ value: sql<string>`coalesce(sum(${invoicesTable.amount}), 0)` }).from(invoicesTable).where(eq(invoicesTable.status, "Paid"));
  const appointmentRows = await db.select().from(appointmentsTable).where(eq(appointmentsTable.date, today)).orderBy(asc(appointmentsTable.time));
  const statusRows = await db.select({ status: appointmentsTable.status, count: sql<number>`count(*)` }).from(appointmentsTable).groupBy(appointmentsTable.status);
  const activityRows = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt)).limit(5);
  return res.json({
    stats: { patients: Number(patientCount.count), doctors: Number(doctorCount.count), appointments: Number(appointmentCount.count), revenue: Number(revenue.value) },
    appointmentStatus: statusRows.map((row) => ({ status: row.status, count: Number(row.count) })),
    appointments: await Promise.all(appointmentRows.map(appointmentView)),
    activity: activityRows.map((row) => ({ id: String(row.id), title: row.title, description: row.description, time: row.createdAt.toISOString(), type: row.type })),
    patientTrend: [
      { label: "Mar", value: 18 },
      { label: "Apr", value: 24 },
      { label: "May", value: 29 },
      { label: "Jun", value: 36 },
      { label: "Jul", value: 43 },
      { label: "Aug", value: Number(patientCount.count) },
    ],
    revenueTrend: [
      { label: "Mar", value: 4200 },
      { label: "Apr", value: 5800 },
      { label: "May", value: 6400 },
      { label: "Jun", value: 7200 },
      { label: "Jul", value: 8100 },
      { label: "Aug", value: Number(revenue.value) },
    ],
  });
});

router.get("/patients", async (req, res) => {
  await ensureSeeded();
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conditions = [];
  if (search) conditions.push(or(ilike(patientsTable.name, `%${search}%`), ilike(patientsTable.patientId, `%${search}%`), ilike(patientsTable.email, `%${search}%`)));
  if (status) conditions.push(eq(patientsTable.status, status));
  const rows = await db.select().from(patientsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(patientsTable.createdAt));
  return res.json(rows.map(mapPatient));
});

router.post("/patients", async (req, res) => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check the patient details and try again." });
  const [row] = await db.insert(patientsTable).values({ ...parsed.data, patientId: `P-${1000 + Date.now() % 9000}`, registeredAt: today }).returning();
  return res.status(201).json(mapPatient(row));
});

router.get("/patients/:id", async (req, res) => {
  const row = await patientById(Number(req.params.id));
  if (!row) return res.status(404).json({ message: "Patient not found." });
  const [records, appointments, invoices] = await Promise.all([
    db.select().from(medicalRecordsTable).where(eq(medicalRecordsTable.patientId, row.id)),
    db.select().from(appointmentsTable).where(eq(appointmentsTable.patientId, row.id)),
    db.select().from(invoicesTable).where(eq(invoicesTable.patientId, row.id)),
  ]);
  return res.json({ ...mapPatient(row), records: await Promise.all(records.map(recordView)), appointments: await Promise.all(appointments.map(appointmentView)), invoices: await Promise.all(invoices.map(invoiceView)) });
});

router.put("/patients/:id", async (req, res) => {
  const parsed = UpdatePatientBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check the patient details and try again." });
  const [row] = await db.update(patientsTable).set(parsed.data).where(eq(patientsTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Patient not found." });
  return res.json(mapPatient(row));
});

router.delete("/patients/:id", async (req, res) => {
  const [row] = await db.delete(patientsTable).where(eq(patientsTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Patient not found." });
  return res.status(204).send();
});

router.get("/doctors", async (req, res) => {
  await ensureSeeded();
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conditions = [];
  if (search) conditions.push(or(ilike(doctorsTable.name, `%${search}%`), ilike(doctorsTable.specialty, `%${search}%`), ilike(doctorsTable.department, `%${search}%`)));
  if (status) conditions.push(eq(doctorsTable.status, status));
  const rows = await db.select().from(doctorsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(doctorsTable.name));
  return res.json(rows.map(mapDoctor));
});

router.post("/doctors", async (req, res) => {
  const parsed = CreateDoctorBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check the doctor details and try again." });
  const [row] = await db.insert(doctorsTable).values(parsed.data).returning();
  return res.status(201).json(mapDoctor(row));
});

router.get("/doctors/:id", async (req, res) => {
  const row = await doctorById(Number(req.params.id));
  if (!row) return res.status(404).json({ message: "Doctor not found." });
  const appointments = await db.select().from(appointmentsTable).where(eq(appointmentsTable.doctorId, row.id));
  return res.json({ ...mapDoctor(row), appointments: await Promise.all(appointments.map(appointmentView)) });
});

router.put("/doctors/:id", async (req, res) => {
  const parsed = UpdateDoctorBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check the doctor details and try again." });
  const [row] = await db.update(doctorsTable).set(parsed.data).where(eq(doctorsTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Doctor not found." });
  return res.json(mapDoctor(row));
});

router.delete("/doctors/:id", async (req, res) => {
  const [row] = await db.delete(doctorsTable).where(eq(doctorsTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Doctor not found." });
  return res.status(204).send();
});

router.get("/appointments", async (req, res) => {
  await ensureSeeded();
  const conditions = [];
  if (typeof req.query.date === "string") conditions.push(eq(appointmentsTable.date, req.query.date));
  if (typeof req.query.status === "string") conditions.push(eq(appointmentsTable.status, req.query.status));
  const rows = await db.select().from(appointmentsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(appointmentsTable.date), asc(appointmentsTable.time));
  const views = await Promise.all(rows.map(appointmentView));
  const search = typeof req.query.search === "string" ? req.query.search.toLowerCase() : undefined;
  return res.json(search ? views.filter((row) => `${row.patientName} ${row.doctorName} ${row.reason}`.toLowerCase().includes(search)) : views);
});

router.post("/appointments", async (req, res) => {
  const parsed = CreateAppointmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Complete the appointment details and try again." });
  const conflicts = await db.select().from(appointmentsTable).where(and(eq(appointmentsTable.doctorId, parsed.data.doctorId), eq(appointmentsTable.date, parsed.data.date), eq(appointmentsTable.time, parsed.data.time)));
  if (conflicts.length) return res.status(409).json({ message: "That doctor already has an appointment at this time." });
  const [row] = await db.insert(appointmentsTable).values(parsed.data).returning();
  return res.status(201).json(await appointmentView(row));
});

router.get("/appointments/:id", async (req, res) => {
  const [row] = await db.select().from(appointmentsTable).where(eq(appointmentsTable.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ message: "Appointment not found." });
  return res.json(await appointmentView(row));
});

router.put("/appointments/:id", async (req, res) => {
  const parsed = UpdateAppointmentBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Complete the appointment details and try again." });
  const [row] = await db.update(appointmentsTable).set(parsed.data).where(eq(appointmentsTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Appointment not found." });
  return res.json(await appointmentView(row));
});

router.delete("/appointments/:id", async (req, res) => {
  const [row] = await db.delete(appointmentsTable).where(eq(appointmentsTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Appointment not found." });
  return res.status(204).send();
});

router.get("/records", async (req, res) => {
  await ensureSeeded();
  const rows = await db.select().from(medicalRecordsTable).orderBy(desc(medicalRecordsTable.date));
  const views = await Promise.all(rows.map(recordView));
  const search = typeof req.query.search === "string" ? req.query.search.toLowerCase() : undefined;
  return res.json(search ? views.filter((row) => `${row.patientName} ${row.doctorName} ${row.diagnosis}`.toLowerCase().includes(search)) : views);
});

router.post("/records", async (req, res) => {
  const parsed = CreateMedicalRecordBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check the medical record details and try again." });
  const [row] = await db.insert(medicalRecordsTable).values(parsed.data).returning();
  return res.status(201).json(await recordView(row));
});

router.get("/records/:id", async (req, res) => {
  const [row] = await db.select().from(medicalRecordsTable).where(eq(medicalRecordsTable.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ message: "Medical record not found." });
  return res.json(await recordView(row));
});

router.put("/records/:id", async (req, res) => {
  const parsed = UpdateMedicalRecordBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check the medical record details and try again." });
  const [row] = await db.update(medicalRecordsTable).set(parsed.data).where(eq(medicalRecordsTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Medical record not found." });
  return res.json(await recordView(row));
});

router.get("/invoices", async (req, res) => {
  await ensureSeeded();
  const conditions = [];
  if (typeof req.query.status === "string") conditions.push(eq(invoicesTable.status, req.query.status));
  const rows = await db.select().from(invoicesTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(invoicesTable.date));
  const views = await Promise.all(rows.map(invoiceView));
  const search = typeof req.query.search === "string" ? req.query.search.toLowerCase() : undefined;
  return res.json(search ? views.filter((row) => `${row.invoiceId} ${row.patientName} ${row.service}`.toLowerCase().includes(search)) : views);
});

router.post("/invoices", async (req, res) => {
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check the invoice details and try again." });
  const [row] = await db.insert(invoicesTable).values({
    ...parsed.data,
    amount: String(parsed.data.amount),
    invoiceId: `INV-${2000 + Date.now() % 7000}`,
  }).returning();
  return res.status(201).json(await invoiceView(row));
});

router.get("/invoices/:id", async (req, res) => {
  const [row] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, Number(req.params.id)));
  if (!row) return res.status(404).json({ message: "Invoice not found." });
  return res.json(await invoiceView(row));
});

router.put("/invoices/:id", async (req, res) => {
  const parsed = UpdateInvoiceBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check the invoice details and try again." });
  const [row] = await db.update(invoicesTable).set({
    ...parsed.data,
    amount: String(parsed.data.amount),
  }).where(eq(invoicesTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Invoice not found." });
  return res.json(await invoiceView(row));
});

router.delete("/invoices/:id", async (req, res) => {
  const [row] = await db.delete(invoicesTable).where(eq(invoicesTable.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ message: "Invoice not found." });
  return res.status(204).send();
});

router.get("/analytics", async (_req, res) => {
  await ensureSeeded();
  const [patients, appointments, invoices] = await Promise.all([
    db.select().from(patientsTable),
    db.select().from(appointmentsTable),
    db.select().from(invoicesTable),
  ]);
  const trend = (values: number[]) => ["Mar", "Apr", "May", "Jun", "Jul", "Aug"].map((label, index) => ({ label, value: values[index] ?? 0 }));
  const departments = [...new Set(appointments.map((row) => row.department))];
  return res.json({
    patientGrowth: trend([18, 24, 29, 36, 43, patients.length]),
    appointmentVolume: trend([12, 18, 24, 28, 31, appointments.length]),
    revenue: trend([4200, 5800, 6400, 7200, 8100, invoices.reduce((sum, row) => sum + Number(row.amount), 0)]),
    departmentPerformance: departments.map((department) => {
      const rows = appointments.filter((row) => row.department === department);
      return { department, appointments: rows.length, completed: rows.filter((row) => row.status === "Completed").length };
    }),
    statusBreakdown: ["Scheduled", "Confirmed", "Completed", "Cancelled", "No-show"].map((status) => ({ status, value: appointments.filter((row) => row.status === status).length })),
  });
});

router.get("/settings", async (_req, res) => {
  await ensureSeeded();
  const [row] = await db.select().from(settingsTable).limit(1);
  if (!row) return res.status(404).json({ message: "Settings not found." });
  return res.json({
    organizationName: row.organizationName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    appearance: row.appearance,
    notifications: { appointments: row.appointmentNotifications, billing: row.billingNotifications, system: row.systemNotifications },
  });
});

router.put("/settings", async (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ message: "Check your settings and try again." });
  const [existing] = await db.select().from(settingsTable).limit(1);
  const [row] = existing
    ? await db.update(settingsTable).set({
        organizationName: parsed.data.organizationName,
        phone: parsed.data.phone,
        email: parsed.data.email,
        address: parsed.data.address,
        appearance: parsed.data.appearance,
        appointmentNotifications: parsed.data.notifications.appointments,
        billingNotifications: parsed.data.notifications.billing,
        systemNotifications: parsed.data.notifications.system,
        updatedAt: new Date(),
      }).where(eq(settingsTable.id, existing.id)).returning()
    : await db.insert(settingsTable).values({
        organizationName: parsed.data.organizationName,
        phone: parsed.data.phone,
        email: parsed.data.email,
        address: parsed.data.address,
        appearance: parsed.data.appearance,
        appointmentNotifications: parsed.data.notifications.appointments,
        billingNotifications: parsed.data.notifications.billing,
        systemNotifications: parsed.data.notifications.system,
      }).returning();
  return res.json({
    organizationName: row.organizationName,
    phone: row.phone,
    email: row.email,
    address: row.address,
    appearance: row.appearance,
    notifications: { appointments: row.appointmentNotifications, billing: row.billingNotifications, system: row.systemNotifications },
  });
});

router.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q.trim()) return res.json({ patients: [], doctors: [], appointments: [], invoices: [] });
  await ensureSeeded();
  const [patients, doctors, appointments, invoices] = await Promise.all([
    db.select().from(patientsTable).where(or(ilike(patientsTable.name, `%${q}%`), ilike(patientsTable.patientId, `%${q}%`))).limit(5),
    db.select().from(doctorsTable).where(or(ilike(doctorsTable.name, `%${q}%`), ilike(doctorsTable.specialty, `%${q}%`))).limit(5),
    db.select().from(appointmentsTable).limit(20),
    db.select().from(invoicesTable).limit(20),
  ]);
  const appointmentViews = await Promise.all(appointments.map(appointmentView));
  const invoiceViews = await Promise.all(invoices.map(invoiceView));
  const needle = q.toLowerCase();
  return res.json({
    patients: patients.map(mapPatient),
    doctors: doctors.map(mapDoctor),
    appointments: appointmentViews.filter((row) => `${row.patientName} ${row.doctorName} ${row.reason}`.toLowerCase().includes(needle)).slice(0, 5),
    invoices: invoiceViews.filter((row) => `${row.invoiceId} ${row.patientName} ${row.service}`.toLowerCase().includes(needle)).slice(0, 5),
  });
});

router.get("/notifications", async (_req, res) => {
  await ensureSeeded();
  const rows = await db.select().from(notificationsTable).orderBy(desc(notificationsTable.createdAt));
  return res.json(rows.map((row) => ({ id: row.id, title: row.title, description: row.description, time: row.createdAt.toISOString(), read: row.read, type: row.type })));
});

router.post("/notifications/:id/read", async (req, res) => {
  await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.id, Number(req.params.id)));
  return res.status(204).send();
});

export { ensureSeeded };
export default router;