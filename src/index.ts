import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { db } from "./lib/db.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Auth Routes
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return res.status(401).json({
        error: "The email you entered is not registered, please check again",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      },
    });
  } catch (error) {
    console.error("Login API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/companies", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Company name is required" });
    }

    const companyNameTrimmed = name.trim();
    const existingCompany = await db.company.findUnique({
      where: { name: companyNameTrimmed },
    });

    if (existingCompany) {
      return res.status(400).json({
        error: "A company with this name already exists",
      });
    }

    const newCompany = await db.company.create({
      data: {
        name: companyNameTrimmed,
      },
    });

    return res.status(201).json({
      success: true,
      company: newCompany,
    });
  } catch (error) {
    console.error("Create company error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/companies/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const company = await db.company.findUnique({
      where: { id },
    });

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    return res.json({ company });
  } catch (error) {
    console.error("GET company error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/companies/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, website, phone, email, overview } = req.body;

    const existingCompany = await db.company.findUnique({
      where: { id },
    });

    if (!existingCompany) {
      return res.status(404).json({ error: "Company not found" });
    }

    // If name is being changed, ensure it's unique
    if (name && name.trim().toLowerCase() !== existingCompany.name.toLowerCase()) {
      const duplicateCompany = await db.company.findUnique({
        where: { name: name.trim() },
      });
      if (duplicateCompany) {
        return res.status(400).json({ error: "A company with this name already exists" });
      }
    }

    const updatedCompany = await db.company.update({
      where: { id },
      data: {
        name: name ? name.trim() : existingCompany.name,
        website: website !== undefined ? website.trim() : existingCompany.website,
        phone: phone !== undefined ? phone.trim() : existingCompany.phone,
        email: email !== undefined ? email.trim() : existingCompany.email,
        overview: overview !== undefined ? overview.trim() : existingCompany.overview,
      },
    });

    return res.json({ company: updatedCompany });
  } catch (error) {
    console.error("PUT company error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password, companyId } = req.body;

    if (!name || !email || !password || !companyId) {
      return res.status(400).json({ error: "Name, email, password, and companyId are required" });
    }

    const emailNormalized = email.toLowerCase().trim();

    const existingUser = await db.user.findUnique({
      where: { email: emailNormalized },
    });

    if (existingUser) {
      return res.status(400).json({
        error: "An account with this email address already exists",
      });
    }

    const companyExists = await db.company.findUnique({
      where: { id: companyId },
    });

    if (!companyExists) {
      return res.status(400).json({
        error: "Invalid company ID provided",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await db.user.create({
      data: {
        name,
        email: emailNormalized,
        password: hashedPassword,
        companyId: companyExists.id,
        role: "ADMIN",
      },
    });

    return res.status(201).json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        companyId: newUser.companyId,
      },
    });
  } catch (error) {
    console.error("Register API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Employee Routes

// GET /api/employees (list with filters, search, and pagination)
app.get("/api/employees", async (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || "";
    const search = (req.query.search as string) || "";
    const office = (req.query.office as string) || "";
    const role = (req.query.role as string) || "";
    const status = (req.query.status as string) || "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (companyId) {
      where.companyId = companyId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (office && office !== "All Offices") {
      where.office = office;
    }

    if (role && role !== "All Job Titles") {
      where.role = role;
    }

    if (status && status !== "All Status") {
      where.status = status.toUpperCase().replace(" ", "_");
    }

    const total = await db.employee.count({ where });

    const employees = await db.employee.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    return res.json({
      employees,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET employees API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/employees (create new employee)
app.post("/api/employees", async (req, res) => {
  try {
    const { name, email, role, manager, department, office, status, account, avatar, companyId } = req.body;

    if (!name || !email || !role || !department || !office) {
      return res.status(400).json({
        error: "Required fields (name, email, role, department, office) are missing",
      });
    }

    const existingEmp = await db.employee.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingEmp) {
      return res.status(400).json({
        error: "An employee with this email address already exists",
      });
    }

    const newEmployee = await db.employee.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        role,
        manager: manager || "",
        department,
        office,
        status: status || "",
        account: account || "",
        avatar: avatar || ``,
        companyId: companyId || null,
      },
    });

    return res.status(201).json({ employee: newEmployee });
  } catch (error) {
    console.error("POST employee API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/employees/:id (update employee details)
app.put("/api/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, manager, department, office, status, account, avatar } = req.body;

    const existingEmp = await db.employee.findUnique({
      where: { id },
    });

    if (!existingEmp) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // If email is being changed, ensure it's not taken
    if (email && email.toLowerCase().trim() !== existingEmp.email.toLowerCase().trim()) {
      const emailTaken = await db.employee.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (emailTaken) {
        return res.status(400).json({ error: "Email is already in use by another employee" });
      }
    }

    const updatedEmployee = await db.employee.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existingEmp.name,
        email: email !== undefined ? email.toLowerCase().trim() : existingEmp.email,
        role: role !== undefined ? role : existingEmp.role,
        manager: manager !== undefined ? manager : existingEmp.manager,
        department: department !== undefined ? department : existingEmp.department,
        office: office !== undefined ? office : existingEmp.office,
        status: status !== undefined ? status : existingEmp.status,
        account: account !== undefined ? account : existingEmp.account,
        avatar: avatar !== undefined ? avatar : existingEmp.avatar,
      },
    });

    return res.json({ employee: updatedEmployee });
  } catch (error) {
    console.error("PUT employee API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/employees/:id (get single employee details)
app.get("/api/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const companyId = (req.query.companyId as string) || "";

    const employee = await db.employee.findUnique({
      where: { id },
    });

    if (!employee || (companyId && employee.companyId !== companyId)) {
      return res.status(404).json({ error: "Employee not found" });
    }

    return res.json({ employee });
  } catch (error) {
    console.error("GET employee by ID error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/employees/:id (delete employee)
app.delete("/api/employees/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingEmp = await db.employee.findUnique({
      where: { id },
    });

    if (!existingEmp) {
      return res.status(404).json({ error: "Employee not found" });
    }

    await db.employee.delete({
      where: { id },
    });

    return res.json({ success: true, message: "Employee deleted successfully" });
  } catch (error) {
    console.error("DELETE employee API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Department Routes

// GET /api/departments (list all departments)
app.get("/api/departments", async (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || "";
    const search = (req.query.search as string) || "";
    const where: any = {};
    if (companyId) {
      where.companyId = companyId;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    const departments = await db.department.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return res.json({ departments });
  } catch (error) {
    console.error("GET departments error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/departments (create department)
app.post("/api/departments", async (req, res) => {
  try {
    const { name, parentDept, description, leader, companyId } = req.body;

    if (!name || !parentDept) {
      return res.status(400).json({ error: "Required fields (name, parentDept) are missing" });
    }

    const existingDept = await db.department.findFirst({
      where: { name: name.trim(), companyId: companyId || null },
    });

    if (existingDept) {
      return res.status(400).json({ error: "A department with this name already exists" });
    }

    const newDept = await db.department.create({
      data: {
        name: name.trim(),
        parentDept: parentDept.trim(),
        description: description || "",
        leader: leader || "None",
        companyId: companyId || null,
      },
    });

    return res.status(201).json({ department: newDept });
  } catch (error) {
    console.error("POST department error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/departments/:id (delete department)
app.delete("/api/departments/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingDept = await db.department.findUnique({
      where: { id },
    });

    if (!existingDept) {
      return res.status(404).json({ error: "Department not found" });
    }

    await db.department.delete({
      where: { id },
    });

    return res.json({ success: true, message: "Department deleted successfully" });
  } catch (error) {
    console.error("DELETE department error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/departments/:id (update department)
app.put("/api/departments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentDept, description, leader } = req.body;

    if (!name || !parentDept) {
      return res.status(400).json({ error: "Required fields (name, parentDept) are missing" });
    }

    const existingDept = await db.department.findUnique({
      where: { id },
    });

    if (!existingDept) {
      return res.status(404).json({ error: "Department not found" });
    }

    // If changing name, ensure it is unique within the same company
    if (name.trim().toLowerCase() !== existingDept.name.toLowerCase()) {
      const duplicateDept = await db.department.findFirst({
        where: { name: name.trim(), companyId: existingDept.companyId },
      });
      if (duplicateDept) {
        return res.status(400).json({ error: "A department with this name already exists" });
      }
    }

    const updatedDept = await db.department.update({
      where: { id },
      data: {
        name: name.trim(),
        parentDept: parentDept.trim(),
        description: description || "",
        leader: leader || "None",
      },
    });

    return res.json({ department: updatedDept });
  } catch (error) {
    console.error("PUT department error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Office Routes

// GET /api/offices (list all offices)
app.get("/api/offices", async (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || "";
    const search = (req.query.search as string) || "";
    const where: any = {};
    if (companyId) {
      where.companyId = companyId;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    const offices = await db.office.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return res.json({ offices });
  } catch (error) {
    console.error("GET offices error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/offices (create office)
app.post("/api/offices", async (req, res) => {
  try {
    const { name, location, description, isHQ, active, timezone, phone, email, headOfOffice, companyId } = req.body;

    if (!name || !location) {
      return res.status(400).json({ error: "Required fields (name, location) are missing" });
    }

    const existingOffice = await db.office.findFirst({
      where: { name: name.trim(), companyId: companyId || null },
    });

    if (existingOffice) {
      return res.status(400).json({ error: "An office with this name already exists" });
    }

    const newOffice = await db.office.create({
      data: {
        name: name.trim(),
        location: location.trim(),
        description: description || "",
        isHQ: isHQ !== undefined ? !!isHQ : false,
        active: active !== undefined ? !!active : true,
        timezone: timezone || "GMT +00:00",
        phone: phone || "",
        email: email || "",
        headOfOffice: headOfOffice || "Management",
        companyId: companyId || null,
      },
    });

    return res.status(201).json({ office: newOffice });
  } catch (error) {
    console.error("POST office error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/offices/:id (delete office)
app.delete("/api/offices/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingOffice = await db.office.findUnique({
      where: { id },
    });

    if (!existingOffice) {
      return res.status(404).json({ error: "Office not found" });
    }

    await db.office.delete({
      where: { id },
    });

    return res.json({ success: true, message: "Office deleted successfully" });
  } catch (error) {
    console.error("DELETE office error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/offices/:id (update office)
app.put("/api/offices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, description, isHQ, active, timezone, phone, email, headOfOffice } = req.body;

    if (!name || !location) {
      return res.status(400).json({ error: "Required fields (name, location) are missing" });
    }

    const existingOffice = await db.office.findUnique({
      where: { id },
    });

    if (!existingOffice) {
      return res.status(404).json({ error: "Office not found" });
    }

    // If changing name, ensure it is unique within the same company
    if (name.trim().toLowerCase() !== existingOffice.name.toLowerCase()) {
      const duplicateOffice = await db.office.findFirst({
        where: { name: name.trim(), companyId: existingOffice.companyId },
      });
      if (duplicateOffice) {
        return res.status(400).json({ error: "An office with this name already exists" });
      }
    }

    const updatedOffice = await db.office.update({
      where: { id },
      data: {
        name: name.trim(),
        location: location.trim(),
        description: description || "",
        isHQ: isHQ !== undefined ? !!isHQ : existingOffice.isHQ,
        active: active !== undefined ? !!active : existingOffice.active,
        timezone: timezone !== undefined ? timezone : existingOffice.timezone,
        phone: phone !== undefined ? phone : existingOffice.phone,
        email: email !== undefined ? email : existingOffice.email,
        headOfOffice: headOfOffice !== undefined ? headOfOffice : existingOffice.headOfOffice,
      },
    });

    return res.json({ office: updatedOffice });
  } catch (error) {
    console.error("PUT office error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Job Title Routes

// GET /api/job-titles (list all job titles)
app.get("/api/job-titles", async (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || "";
    const search = (req.query.search as string) || "";
    const where: any = {};
    if (companyId) {
      where.companyId = companyId;
    }
    if (search) {
      where.title = { contains: search, mode: "insensitive" };
    }
    const jobTitles = await db.jobTitle.findMany({
      where,
      orderBy: { title: "asc" },
    });
    return res.json({ jobTitles });
  } catch (error) {
    console.error("GET job-titles error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/job-titles (create job title)
app.post("/api/job-titles", async (req, res) => {
  try {
    const { title, active, companyId } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Required field (title) is missing" });
    }

    const existingJob = await db.jobTitle.findFirst({
      where: { title: title.trim(), companyId: companyId || null },
    });

    if (existingJob) {
      return res.status(400).json({ error: "A job title with this name already exists" });
    }

    const newJob = await db.jobTitle.create({
      data: {
        title: title.trim(),
        active: active !== undefined ? !!active : true,
        companyId: companyId || null,
      },
    });

    return res.status(201).json({ jobTitle: newJob });
  } catch (error) {
    console.error("POST job-titles error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/job-titles/:id (delete job title)
app.delete("/api/job-titles/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existingJob = await db.jobTitle.findUnique({
      where: { id },
    });

    if (!existingJob) {
      return res.status(404).json({ error: "Job title not found" });
    }

    await db.jobTitle.delete({
      where: { id },
    });

    return res.json({ success: true, message: "Job title deleted successfully" });
  } catch (error) {
    console.error("DELETE job-titles error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/job-titles/:id (update job title)
app.put("/api/job-titles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, active } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Required field (title) is missing" });
    }

    const existingJob = await db.jobTitle.findUnique({
      where: { id },
    });

    if (!existingJob) {
      return res.status(404).json({ error: "Job title not found" });
    }

    // If changing name, ensure it is unique within the same company
    if (title.trim().toLowerCase() !== existingJob.title.toLowerCase()) {
      const duplicateJob = await db.jobTitle.findFirst({
        where: { title: title.trim(), companyId: existingJob.companyId },
      });
      if (duplicateJob) {
        return res.status(400).json({ error: "A job title with this name already exists" });
      }
    }

    const updatedJob = await db.jobTitle.update({
      where: { id },
      data: {
        title: title.trim(),
        active: active !== undefined ? !!active : existingJob.active,
      },
    });

    return res.json({ jobTitle: updatedJob });
  } catch (error) {
    console.error("PUT job-titles error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Work Schedule Routes

// GET /api/work-schedules
app.get("/api/work-schedules", async (req, res) => {
  try {
    const companyId = (req.query.companyId as string) || "";
    const where: any = {};
    if (companyId) {
      where.companyId = companyId;
    }
    const schedules = await db.workSchedule.findMany({
      where,
      include: { dailyHours: true },
      orderBy: { createdAt: "asc" },
    });
    return res.json({ workSchedules: schedules });
  } catch (error) {
    console.error("GET work-schedules error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/work-schedules
app.post("/api/work-schedules", async (req, res) => {
  try {
    const { title, isDefault, active, standardHours, effectiveFrom, type, totalHours, companyId, dailyHours } = req.body;

    if (!title || !effectiveFrom) {
      return res.status(400).json({ error: "Required fields (title, effectiveFrom) are missing" });
    }

    const newSchedule = await db.workSchedule.create({
      data: {
        title: title.trim(),
        isDefault: isDefault !== undefined ? !!isDefault : false,
        active: active !== undefined ? !!active : true,
        standardHours: standardHours || "8h 00m",
        effectiveFrom: effectiveFrom.trim(),
        type: type || "Duration-based",
        totalHours: totalHours || "40h 00m",
        companyId: companyId || null,
        dailyHours: {
          create: Array.isArray(dailyHours)
            ? dailyHours.map((d: { day: string; hours: string; active?: boolean }) => ({
                day: d.day,
                hours: d.hours,
                active: d.active !== undefined ? !!d.active : true,
              }))
            : [],
        },
      },
      include: { dailyHours: true },
    });

    return res.status(201).json({ workSchedule: newSchedule });
  } catch (error) {
    console.error("POST work-schedules error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/work-schedules/:id
app.put("/api/work-schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, isDefault, active, standardHours, effectiveFrom, type, totalHours, dailyHours } = req.body;

    const existing = await db.workSchedule.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Work schedule not found" });
    }

    const updated = await db.workSchedule.update({
      where: { id },
      data: {
        title: title !== undefined ? title.trim() : existing.title,
        isDefault: isDefault !== undefined ? !!isDefault : existing.isDefault,
        active: active !== undefined ? !!active : existing.active,
        standardHours: standardHours !== undefined ? standardHours : existing.standardHours,
        effectiveFrom: effectiveFrom !== undefined ? effectiveFrom.trim() : existing.effectiveFrom,
        type: type !== undefined ? type : existing.type,
        totalHours: totalHours !== undefined ? totalHours : existing.totalHours,
        ...(Array.isArray(dailyHours) && {
          dailyHours: {
            deleteMany: {},
            create: dailyHours.map((d: { day: string; hours: string; active?: boolean }) => ({
              day: d.day,
              hours: d.hours,
              active: d.active !== undefined ? !!d.active : true,
            })),
          },
        }),
      },
      include: { dailyHours: true },
    });

    return res.json({ workSchedule: updated });
  } catch (error) {
    console.error("PUT work-schedules error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/work-schedules/:id
app.delete("/api/work-schedules/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.workSchedule.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Work schedule not found" });
    }

    await db.workSchedule.delete({ where: { id } });

    return res.json({ success: true, message: "Work schedule deleted successfully" });
  } catch (error) {
    console.error("DELETE work-schedules error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
