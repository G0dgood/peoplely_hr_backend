import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { db } from "./lib/db.js";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust this for production
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Socket.io Connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join_conversation", (conversationId) => {
    socket.join(conversationId);
    console.log(`User ${socket.id} joined conversation ${conversationId}`);
  });

  socket.on("send_message", (data) => {
    // data should contain conversationId, senderId, text, etc.
    console.log("Message received:", data);
    io.to(data.conversationId).emit("receive_message", data);
  });

  socket.on("toggle_reaction", (data) => {
    // data: { conversationId, messageId, reaction, userId }
    console.log("Reaction toggled:", data);
    io.to(data.conversationId).emit("receive_reaction", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

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
    if (
      name &&
      name.trim().toLowerCase() !== existingCompany.name.toLowerCase()
    ) {
      const duplicateCompany = await db.company.findUnique({
        where: { name: name.trim() },
      });
      if (duplicateCompany) {
        return res
          .status(400)
          .json({ error: "A company with this name already exists" });
      }
    }

    const updatedCompany = await db.company.update({
      where: { id },
      data: {
        name: name ? name.trim() : existingCompany.name,
        website:
          website !== undefined ? website.trim() : existingCompany.website,
        phone: phone !== undefined ? phone.trim() : existingCompany.phone,
        email: email !== undefined ? email.trim() : existingCompany.email,
        overview:
          overview !== undefined ? overview.trim() : existingCompany.overview,
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
      return res
        .status(400)
        .json({ error: "Name, email, password, and companyId are required" });
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
    const {
      name,
      email,
      role,
      manager,
      department,
      office,
      status,
      account,
      avatar,
      companyId,
    } = req.body;

    if (!name || !email || !role || !department || !office) {
      return res.status(400).json({
        error:
          "Required fields (name, email, role, department, office) are missing",
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
    const {
      name,
      email,
      role,
      manager,
      department,
      office,
      status,
      account,
      avatar,
    } = req.body;

    const existingEmp = await db.employee.findUnique({
      where: { id },
    });

    if (!existingEmp) {
      return res.status(404).json({ error: "Employee not found" });
    }

    // If email is being changed, ensure it's not taken
    if (
      email &&
      email.toLowerCase().trim() !== existingEmp.email.toLowerCase().trim()
    ) {
      const emailTaken = await db.employee.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      if (emailTaken) {
        return res
          .status(400)
          .json({ error: "Email is already in use by another employee" });
      }
    }

    const updatedEmployee = await db.employee.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existingEmp.name,
        email:
          email !== undefined ? email.toLowerCase().trim() : existingEmp.email,
        role: role !== undefined ? role : existingEmp.role,
        manager: manager !== undefined ? manager : existingEmp.manager,
        department:
          department !== undefined ? department : existingEmp.department,
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

    return res.json({
      success: true,
      message: "Employee deleted successfully",
    });
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
      return res
        .status(400)
        .json({ error: "Required fields (name, parentDept) are missing" });
    }

    const existingDept = await db.department.findFirst({
      where: { name: name.trim(), companyId: companyId || null },
    });

    if (existingDept) {
      return res
        .status(400)
        .json({ error: "A department with this name already exists" });
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

    return res.json({
      success: true,
      message: "Department deleted successfully",
    });
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
      return res
        .status(400)
        .json({ error: "Required fields (name, parentDept) are missing" });
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
        return res
          .status(400)
          .json({ error: "A department with this name already exists" });
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
    const {
      name,
      location,
      description,
      isHQ,
      active,
      timezone,
      phone,
      email,
      headOfOffice,
      companyId,
    } = req.body;

    if (!name || !location) {
      return res
        .status(400)
        .json({ error: "Required fields (name, location) are missing" });
    }

    const existingOffice = await db.office.findFirst({
      where: { name: name.trim(), companyId: companyId || null },
    });

    if (existingOffice) {
      return res
        .status(400)
        .json({ error: "An office with this name already exists" });
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
    const {
      name,
      location,
      description,
      isHQ,
      active,
      timezone,
      phone,
      email,
      headOfOffice,
    } = req.body;

    if (!name || !location) {
      return res
        .status(400)
        .json({ error: "Required fields (name, location) are missing" });
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
        return res
          .status(400)
          .json({ error: "An office with this name already exists" });
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
        headOfOffice:
          headOfOffice !== undefined
            ? headOfOffice
            : existingOffice.headOfOffice,
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
      return res
        .status(400)
        .json({ error: "Required field (title) is missing" });
    }

    const existingJob = await db.jobTitle.findFirst({
      where: { title: title.trim(), companyId: companyId || null },
    });

    if (existingJob) {
      return res
        .status(400)
        .json({ error: "A job title with this name already exists" });
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

    return res.json({
      success: true,
      message: "Job title deleted successfully",
    });
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
      return res
        .status(400)
        .json({ error: "Required field (title) is missing" });
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
        return res
          .status(400)
          .json({ error: "A job title with this name already exists" });
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
    const {
      title,
      isDefault,
      active,
      standardHours,
      effectiveFrom,
      type,
      totalHours,
      companyId,
      dailyHours,
    } = req.body;

    if (!title || !effectiveFrom) {
      return res
        .status(400)
        .json({ error: "Required fields (title, effectiveFrom) are missing" });
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
            ? dailyHours.map(
                (d: { day: string; hours: string; active?: boolean }) => ({
                  day: d.day,
                  hours: d.hours,
                  active: d.active !== undefined ? !!d.active : true,
                }),
              )
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
    const {
      title,
      isDefault,
      active,
      standardHours,
      effectiveFrom,
      type,
      totalHours,
      dailyHours,
    } = req.body;

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
        standardHours:
          standardHours !== undefined ? standardHours : existing.standardHours,
        effectiveFrom:
          effectiveFrom !== undefined
            ? effectiveFrom.trim()
            : existing.effectiveFrom,
        type: type !== undefined ? type : existing.type,
        totalHours: totalHours !== undefined ? totalHours : existing.totalHours,
        ...(Array.isArray(dailyHours) && {
          dailyHours: {
            deleteMany: {},
            create: dailyHours.map(
              (d: { day: string; hours: string; active?: boolean }) => ({
                day: d.day,
                hours: d.hours,
                active: d.active !== undefined ? !!d.active : true,
              }),
            ),
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

    return res.json({
      success: true,
      message: "Work schedule deleted successfully",
    });
  } catch (error) {
    console.error("DELETE work-schedules error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Roles & Permissions Routes

const PERMISSION_SECTIONS = [
  "Profile Picture",
  "Personal Info",
  "Address",
  "Emergency Contact",
  "Offboarding Details",
  "Bank Info",
  "Job Information",
  "Work Schedule",
];

// GET /api/roles
app.get("/api/roles", async (req, res) => {
  try {
    let companyId = (req.query.companyId as string) || "";
    if (!companyId) {
      const firstCompany = await db.company.findFirst();
      if (firstCompany) {
        companyId = firstCompany.id;
      } else {
        const defaultCompany = await db.company.create({
          data: { name: "Default Company" },
        });
        companyId = defaultCompany.id;
      }
    }

    const roles = await db.role.findMany({
      where: { companyId },
      include: { permissions: true },
      orderBy: { createdAt: "asc" },
    });

    return res.json({ roles });
  } catch (error) {
    console.error("GET roles error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/roles
app.post("/api/roles", async (req, res) => {
  try {
    const { name, description, companyId } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Role name is required" });
    }

    let targetCompanyId = companyId;
    if (!targetCompanyId) {
      const firstCompany = await db.company.findFirst();
      if (firstCompany) {
        targetCompanyId = firstCompany.id;
      } else {
        const defaultCompany = await db.company.create({
          data: { name: "Default Company" },
        });
        targetCompanyId = defaultCompany.id;
      }
    }

    // Check if role name already exists in company
    const existingRole = await db.role.findFirst({
      where: {
        name: { equals: name.trim(), mode: "insensitive" },
        companyId: targetCompanyId,
      },
    });

    if (existingRole) {
      return res.status(400).json({
        error: "A role with this name already exists in this company",
      });
    }

    const defaultPermissions = PERMISSION_SECTIONS.map((section) => ({
      section,
      accessType: "View & Edit",
    }));

    const newRole = await db.role.create({
      data: {
        name: name.trim(),
        description: description || "",
        isDefault: false,
        accessLevel: "All employees",
        companyId: targetCompanyId,
        permissions: {
          create: defaultPermissions,
        },
      },
      include: { permissions: true },
    });

    return res.status(201).json({ role: newRole });
  } catch (error) {
    console.error("POST roles error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/roles/:id
app.put("/api/roles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, accessLevel, description, permissions } = req.body;

    const role = await db.role.findUnique({
      where: { id },
      include: { permissions: true },
    });

    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const updateData: any = {};
    if (
      name !== undefined &&
      name.trim().toLowerCase() !== role.name.toLowerCase()
    ) {
      const existing = await db.role.findFirst({
        where: {
          name: { equals: name.trim(), mode: "insensitive" },
          companyId: role.companyId,
          NOT: { id },
        },
      });
      if (existing) {
        return res.status(400).json({
          error: "A role with this name already exists in this company",
        });
      }
      updateData.name = name.trim();
    }
    if (accessLevel !== undefined) {
      updateData.accessLevel = accessLevel;
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    // Update role fields first if any
    if (Object.keys(updateData).length > 0) {
      await db.role.update({
        where: { id },
        data: updateData,
      });
    }

    // Update permissions if provided
    if (Array.isArray(permissions)) {
      for (const p of permissions) {
        if (p.section && p.accessType) {
          // Find permission for this section
          const existingPerm = role.permissions.find(
            (rp) => rp.section.toLowerCase() === p.section.toLowerCase(),
          );
          if (existingPerm) {
            await db.rolePermission.update({
              where: { id: existingPerm.id },
              data: { accessType: p.accessType },
            });
          } else {
            // Create it if it somehow doesn't exist
            await db.rolePermission.create({
              data: {
                roleId: id,
                section: p.section,
                accessType: p.accessType,
              },
            });
          }
        } else if (p.id && p.accessType) {
          await db.rolePermission.update({
            where: { id: p.id },
            data: { accessType: p.accessType },
          });
        }
      }
    }

    // Fetch final updated role
    const finalRole = await db.role.findUnique({
      where: { id },
      include: { permissions: true },
    });

    return res.json({ role: finalRole });
  } catch (error) {
    console.error("PUT role error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/roles/:id
app.delete("/api/roles/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.role.findUnique({ where: { id } });
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }
    if (role.isDefault) {
      return res.status(400).json({ error: "Default roles cannot be deleted" });
    }
    await db.role.delete({ where: { id } });
    return res.json({ success: true, message: "Role deleted successfully" });
  } catch (error) {
    console.error("DELETE role error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/roles/:id/members
app.get("/api/roles/:id/members", async (req, res) => {
  try {
    const { id } = req.params;
    const role = await db.role.findUnique({ where: { id } });
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const members = await db.user.findMany({
      where: { roleId: id, companyId: role.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleId: true,
      },
    });

    // Eligible users in the same company
    const eligibleUsers = await db.user.findMany({
      where: {
        companyId: role.companyId,
        NOT: { roleId: id },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleId: true,
      },
    });

    return res.json({ members, eligibleUsers });
  } catch (error) {
    console.error("GET role members error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/roles/:id/members
app.post("/api/roles/:id/members", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const role = await db.role.findUnique({ where: { id } });
    if (!role) {
      return res.status(404).json({ error: "Role not found" });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.companyId !== role.companyId) {
      return res.status(404).json({
        error: "User not found or does not belong to the same company",
      });
    }

    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { roleId: id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        roleId: true,
      },
    });

    return res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("POST role member error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/roles/:id/members/:userId
app.delete("/api/roles/:id/members/:userId", async (req, res) => {
  try {
    const { id, userId } = req.params;

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.roleId !== id) {
      return res
        .status(404)
        .json({ error: "User not found or is not assigned to this role" });
    }

    await db.user.update({
      where: { id: userId },
      data: { roleId: null },
    });

    return res.json({
      success: true,
      message: "Member removed from role successfully",
    });
  } catch (error) {
    console.error("DELETE role member error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checklist Tasks Routes

// GET /api/checklist-tasks
app.get("/api/checklist-tasks", async (req, res) => {
  try {
    let companyId = (req.query.companyId as string) || "";
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "";

    if (!companyId) {
      const firstCompany = await db.company.findFirst();
      if (firstCompany) {
        companyId = firstCompany.id;
      } else {
        const defaultCompany = await db.company.create({
          data: { name: "Default Company" },
        });
        companyId = defaultCompany.id;
      }
    }

    const whereClause: any = { companyId };
    if (status === "Completed") {
      whereClause.completed = true;
    } else if (status === "In Progress") {
      whereClause.completed = false;
    }

    if (search) {
      whereClause.OR = [
        { taskName: { contains: search, mode: "insensitive" } },
        { employeeName: { contains: search, mode: "insensitive" } },
      ];
    }

    const filteredTasks = await db.checklistTask.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    return res.json({ checklistTasks: filteredTasks });
  } catch (error) {
    console.error("GET checklist tasks error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/checklist-tasks
app.post("/api/checklist-tasks", async (req, res) => {
  try {
    const { taskName, dueDate, employeeName, description, companyId } =
      req.body;
    if (!taskName || !dueDate || !employeeName) {
      return res
        .status(400)
        .json({ error: "taskName, dueDate, and employeeName are required" });
    }

    let targetCompanyId = companyId;
    if (!targetCompanyId) {
      const firstCompany = await db.company.findFirst();
      if (firstCompany) {
        targetCompanyId = firstCompany.id;
      } else {
        const defaultCompany = await db.company.create({
          data: { name: "Default Company" },
        });
        targetCompanyId = defaultCompany.id;
      }
    }

    const initials = employeeName
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const newTask = await db.checklistTask.create({
      data: {
        taskName,
        dueDate,
        employeeName,
        employeeInitials: initials || "EE",
        employeeAvatar: "",
        type: "Onboarding",
        completed: false,
        description: description || "",
        companyId: targetCompanyId,
      },
    });

    return res.status(201).json({ checklistTask: newTask });
  } catch (error) {
    console.error("POST checklist task error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/checklist-tasks/:id
app.put("/api/checklist-tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { completed, taskName, dueDate, employeeName, description } =
      req.body;

    const task = await db.checklistTask.findUnique({ where: { id } });
    if (!task) {
      return res.status(404).json({ error: "Checklist task not found" });
    }

    const updateData: any = {};
    if (completed !== undefined) {
      updateData.completed = completed;
    }
    if (taskName !== undefined) {
      updateData.taskName = taskName;
    }
    if (dueDate !== undefined) {
      updateData.dueDate = dueDate;
    }
    if (employeeName !== undefined) {
      updateData.employeeName = employeeName;
      const initials = employeeName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      updateData.employeeInitials = initials || "EE";
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    const updatedTask = await db.checklistTask.update({
      where: { id },
      data: updateData,
    });

    return res.json({ checklistTask: updatedTask });
  } catch (error) {
    console.error("PUT checklist task error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/checklist-tasks/:id
app.delete("/api/checklist-tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const task = await db.checklistTask.findUnique({ where: { id } });
    if (!task) {
      return res.status(404).json({ error: "Checklist task not found" });
    }

    await db.checklistTask.delete({ where: { id } });
    return res.json({
      success: true,
      message: "Checklist task deleted successfully",
    });
  } catch (error) {
    console.error("DELETE checklist task error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
// Conversation & Message Routes

// GET /api/conversations?userId=...
app.get("/api/conversations", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const participants = await db.participant.findMany({
      where: { userId: userId as string },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    const conversations = participants.map((p) => {
      const conv = p.conversation;
      const lastMessage = conv.messages[0];

      // For 1-to-1 chats, find the other participant's name
      let name = conv.name;
      let avatar = "";
      if (!conv.isGroup) {
        const otherParticipant = conv.participants.find(
          (part) => part.userId !== userId,
        );
        name = otherParticipant?.user.name || "Unknown";
      }

      return {
        id: conv.id,
        name,
        avatar,
        preview:
          lastMessage?.text ||
          (lastMessage?.image ? "Image" : lastMessage?.audio ? "Audio" : ""),
        time: lastMessage?.createdAt || conv.createdAt,
        unread: 0, // Placeholder
        online: false, // Placeholder
        isGroup: conv.isGroup,
      };
    });

    return res.json({ conversations });
  } catch (error) {
    console.error("GET conversations error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/conversations/:id/messages
app.get("/api/conversations/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const messages = await db.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
    });

    const formattedMessages = messages.map((m) => ({
      id: m.id,
      type: "received", // Will be adjusted by frontend based on senderId
      senderId: m.senderId,
      text: m.text,
      time: m.createdAt.toISOString().slice(11, 16),
      audio: m.audio,
      audioDuration: m.audioDuration,
      image: m.image,
      imageCaption: m.imageCaption,
      reactions: m.reactions,
      status: m.status,
    }));

    return res.json({ messages: formattedMessages });
  } catch (error) {
    console.error("GET messages error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/conversations
app.post("/api/conversations", async (req, res) => {
  try {
    const { participantIds, name, isGroup, companyId } = req.body;

    if (
      !participantIds ||
      !Array.isArray(participantIds) ||
      participantIds.length < 2
    ) {
      return res
        .status(400)
        .json({ error: "At least two participants are required" });
    }

    const conversation = await db.conversation.create({
      data: {
        name: name || null,
        isGroup: !!isGroup,
        companyId: companyId || null,
        participants: {
          create: participantIds.map((id: string) => ({
            userId: id,
          })),
        },
      },
      include: {
        participants: true,
      },
    });

    return res.status(201).json({ conversation });
  } catch (error) {
    console.error("POST conversation error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// News Routes
// ─────────────────────────────────────────────

// GET /api/news
app.get("/api/news", async (req, res) => {
  try {
    let companyId = (req.query.companyId as string) || "";
    const status = (req.query.status as string) || "";
    const search = (req.query.search as string) || "";

    if (!companyId) {
      const firstCompany = await db.company.findFirst();
      if (firstCompany) {
        companyId = firstCompany.id;
      } else {
        const defaultCompany = await db.company.create({
          data: { name: "Default Company" },
        });
        companyId = defaultCompany.id;
      }
    }

    let newsItems = await db.news.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });

    // Seed default news if empty
    if (newsItems.length === 0) {
      await db.news.createMany({
        data: [
          {
            title: "Promotion Announcement",
            content: `Ladies and Gentlemen:\n\nIt is with great pleasure that I am announcing the promotion of Hugh Gough as one of the new Marketing Directors of InfoTech.\n\nHugh has been with InfoTech for close to ten years, painstakingly climbing the ranks with his dedication and commitment to his work. Three out of those ten years were spent as a marketing manager, where he has shown exemplary performance, as shown in the annual sales and customer retention reports.\n\nHugh has always shown initiative in the performance of his duties, even going above and beyond what is expected of him, in order to ensure that InfoTech delivers quality customer service while producing the expected outputs, well before their respective deadlines.\n\nLet us all congratulate Hugh on this promotion, and wish him luck for all his future undertakings.\n\nRegards`,
            shareWith: "everyone",
            status: "PUBLISHED",
            authorName: "Jakob Geidt",
            authorAvatar:
              "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120",
            companyId,
          },
          {
            title: "Security Policy Update",
            content: `Dear Team,\n\nWe are writing to inform you of important updates to our company's Security Policy, effective immediately.\n\nAll employees are required to:\n1. Use strong, unique passwords for all company accounts\n2. Enable two-factor authentication on all work-related platforms\n3. Report any suspicious activity to the IT department immediately\n4. Not share login credentials with colleagues under any circumstances\n\nCompliance with these policies is mandatory and will be reviewed during annual performance evaluations.\n\nThank you for your cooperation.\n\nIT Security Team`,
            shareWith: "everyone",
            status: "PUBLISHED",
            authorName: "Brandon Curtis",
            authorAvatar:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=120",
            companyId,
          },
          {
            title: "Use of Company Property Policy",
            content: `To All Staff,\n\nPlease be reminded that all company property – including laptops, mobile devices, vehicles, and office equipment – is to be used strictly for business purposes.\n\nPersonal use of company equipment is permitted only in minimal, incidental cases. Any damage resulting from misuse may result in disciplinary action.\n\nPlease return all borrowed equipment to the IT department upon request or upon leaving the company.\n\nHR Department`,
            shareWith: "everyone",
            status: "PUBLISHED",
            authorName: "Madelyn Saris",
            authorAvatar:
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120",
            companyId,
          },
          {
            title: "Company Vehicle Policy",
            content: `Dear Team,\n\nThis is a draft of the updated Company Vehicle Policy currently under review by the HR and Legal teams.\n\nKey highlights:\n- Only authorized drivers with valid licenses may operate company vehicles\n- Vehicles must be returned with a full fuel tank\n- Any accidents or traffic violations must be reported immediately\n- Personal use of company vehicles is prohibited without prior written approval\n\nThis policy will be finalized and published next quarter.\n\nHR Team`,
            shareWith: "everyone",
            status: "DRAFT",
            authorName: "Marilyn Saris",
            authorAvatar:
              "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=120",
            companyId,
          },
        ],
      });

      newsItems = await db.news.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
      });
    }

    // Apply filters
    if (status) {
      newsItems = newsItems.filter(
        (n) => n.status.toUpperCase() === status.toUpperCase(),
      );
    }
    if (search) {
      const q = search.toLowerCase();
      newsItems = newsItems.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.authorName.toLowerCase().includes(q),
      );
    }

    return res.json({ news: newsItems });
  } catch (error) {
    console.error("GET news error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/news/:id
app.get("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const newsItem = await db.news.findUnique({ where: { id } });
    if (!newsItem) {
      return res.status(404).json({ error: "News article not found" });
    }
    return res.json({ newsItem });
  } catch (error) {
    console.error("GET news/:id error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/news
app.post("/api/news", async (req, res) => {
  try {
    let {
      title,
      content,
      shareWith,
      status,
      authorName,
      authorAvatar,
      companyId,
    } = req.body;
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    if (!companyId) {
      const firstCompany = await db.company.findFirst();
      companyId = firstCompany?.id || "";
    }
    const newsItem = await db.news.create({
      data: {
        title,
        content: content || "",
        shareWith: shareWith || "everyone",
        status: status || "DRAFT",
        authorName: authorName || "",
        authorAvatar: authorAvatar || "",
        companyId,
      },
    });
    return res.status(201).json({ newsItem });
  } catch (error) {
    console.error("POST news error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/news/:id
app.put("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, shareWith, status, authorName, authorAvatar } =
      req.body;
    const existing = await db.news.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "News article not found" });
    }
    const newsItem = await db.news.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(shareWith !== undefined && { shareWith }),
        ...(status !== undefined && { status }),
        ...(authorName !== undefined && { authorName }),
        ...(authorAvatar !== undefined && { authorAvatar }),
      },
    });
    return res.json({ newsItem });
  } catch (error) {
    console.error("PUT news/:id error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/news/:id
app.delete("/api/news/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.news.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "News article not found" });
    }
    await db.news.delete({ where: { id } });
    return res.json({
      success: true,
      message: "News article deleted successfully",
    });
  } catch (error) {
    console.error("DELETE news/:id error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Checklist Templates Routes

// GET /api/checklist-templates
app.get("/api/checklist-templates", async (req, res) => {
  try {
    let companyId = (req.query.companyId as string) || "";
    const type = (req.query.type as string) || "";

    if (!companyId) {
      const firstCompany = await db.company.findFirst();
      if (firstCompany) {
        companyId = firstCompany.id;
      } else {
        const defaultCompany = await db.company.create({
          data: { name: "Default Company" },
        });
        companyId = defaultCompany.id;
      }
    }

    let templates = await db.checklistTemplate.findMany({
      where: { companyId },
      include: { tasks: true },
    });

    if (templates.length === 0) {
      // Seed default onboarding templates
      await db.checklistTemplate.create({
        data: {
          name: "Onboarding v.1",
          description: "Files about the importance of essential tasks",
          type: "onboarding",
          companyId,
          tasks: {
            create: [
              {
                name: "Prepare company welcome kit",
                tag: "CHECKLIST",
                assignee: "Line Manager",
                dueDate: "1 day before join date",
                description:
                  "Please ensure that your new team member have a prepared workstation with:\n1. Laptop\n2. Work email\n3. Internet/Team sites access",
              },
              {
                name: "Prepare Workstation",
                tag: "CHECKLIST",
                assignee: "IT Support",
                dueDate: "3 days before join date",
                description:
                  "Setup physical desk space, monitor, keyboard, mouse, and ensure cabling is completed.",
              },
              {
                name: "Submit Document - Soft copy of ID card",
                tag: "UPLOAD",
                assignee: "Employee",
                dueDate: "On join date",
                description:
                  "Employee must upload a clear scanned copy of their national ID card or passport.",
              },
            ],
          },
        },
      });

      await db.checklistTemplate.create({
        data: {
          name: "Probation",
          description: "Files about the importance of essential tasks",
          type: "onboarding",
          companyId,
          tasks: {
            create: [
              {
                name: "Learn team members faces before joining",
                tag: "UPLOAD",
                assignee: "Employee",
                dueDate: "7 days before join date",
                description:
                  "Check the employee directory and familiarize yourself with the immediate project team members.",
              },
              {
                name: "Provide your Home Address",
                tag: "EMPLOYEE INFORMATION",
                assignee: "Employee",
                dueDate: "On join date",
                description:
                  "Enter full residential address details for tax reporting and employee records.",
              },
              {
                name: "Collect Documents - Hard Copies",
                tag: "UPLOAD",
                assignee: "HR Administrator",
                dueDate: "3 days after join date",
                description:
                  "Verify physical original documents against uploaded scanned items and file them in the folder.",
              },
            ],
          },
        },
      });

      // Seed default offboarding templates
      await db.checklistTemplate.create({
        data: {
          name: "Standard Offboarding",
          description: "Tasks for employee departure and offboarding processes",
          type: "offboarding",
          companyId,
        },
      });

      await db.checklistTemplate.create({
        data: {
          name: "Contract Expiration",
          description: "Standard checklist for contract non-renewals",
          type: "offboarding",
          companyId,
        },
      });

      // Re-fetch
      templates = await db.checklistTemplate.findMany({
        where: { companyId },
        include: { tasks: true },
      });
    }

    // Filter by type if provided
    if (type) {
      templates = templates.filter(
        (t) => t.type.toLowerCase() === type.toLowerCase(),
      );
    }

    return res.json({ checklistTemplates: templates });
  } catch (error) {
    console.error("GET checklist templates error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/checklist-templates
app.post("/api/checklist-templates", async (req, res) => {
  try {
    const { name, description, type, companyId } = req.body;
    if (!name || !type) {
      return res.status(400).json({ error: "name and type are required" });
    }

    let targetCompanyId = companyId;
    if (!targetCompanyId) {
      const firstCompany = await db.company.findFirst();
      if (firstCompany) {
        targetCompanyId = firstCompany.id;
      } else {
        const defaultCompany = await db.company.create({
          data: { name: "Default Company" },
        });
        targetCompanyId = defaultCompany.id;
      }
    }

    const newTemplate = await db.checklistTemplate.create({
      data: {
        name,
        description: description || "",
        type: type.toLowerCase(),
        companyId: targetCompanyId,
      },
    });

    return res.status(201).json({ checklistTemplate: newTemplate });
  } catch (error) {
    console.error("POST checklist template error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/checklist-templates/:id
app.get("/api/checklist-templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const template = await db.checklistTemplate.findUnique({
      where: { id },
      include: { tasks: true },
    });
    if (!template) {
      return res.status(404).json({ error: "Checklist template not found" });
    }
    return res.json({ checklistTemplate: template });
  } catch (error) {
    console.error("GET checklist template error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/checklist-templates/:id
app.delete("/api/checklist-templates/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const template = await db.checklistTemplate.findUnique({ where: { id } });
    if (!template) {
      return res.status(404).json({ error: "Checklist template not found" });
    }

    await db.checklistTemplate.delete({ where: { id } });
    return res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    console.error("DELETE checklist template error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/checklist-templates/:id/tasks
app.get("/api/checklist-templates/:id/tasks", async (req, res) => {
  try {
    const { id } = req.params;
    const template = await db.checklistTemplate.findUnique({ where: { id } });
    if (!template) {
      return res.status(404).json({ error: "Checklist template not found" });
    }

    const tasks = await db.checklistTemplateTask.findMany({
      where: { templateId: id },
      orderBy: { createdAt: "asc" },
    });

    return res.json({ tasks });
  } catch (error) {
    console.error("GET template tasks error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/checklist-templates/:id/tasks
app.post("/api/checklist-templates/:id/tasks", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tag, assignee, dueDate, description } = req.body;
    if (!name || !tag || !assignee || !dueDate) {
      return res
        .status(400)
        .json({ error: "name, tag, assignee, and dueDate are required" });
    }

    const template = await db.checklistTemplate.findUnique({ where: { id } });
    if (!template) {
      return res.status(404).json({ error: "Checklist template not found" });
    }

    const newTask = await db.checklistTemplateTask.create({
      data: {
        name,
        tag,
        assignee,
        dueDate,
        description: description || "",
        templateId: id,
      },
    });

    return res.status(201).json({ task: newTask });
  } catch (error) {
    console.error("POST template task error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/checklist-template-tasks/:id
app.put("/api/checklist-template-tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, tag, assignee, dueDate, description } = req.body;

    const task = await db.checklistTemplateTask.findUnique({ where: { id } });
    if (!task) {
      return res.status(404).json({ error: "Template task not found" });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (tag !== undefined) updateData.tag = tag;
    if (assignee !== undefined) updateData.assignee = assignee;
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (description !== undefined) updateData.description = description;

    const updatedTask = await db.checklistTemplateTask.update({
      where: { id },
      data: updateData,
    });

    return res.json({ task: updatedTask });
  } catch (error) {
    console.error("PUT template task error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/checklist-template-tasks/:id
app.delete("/api/checklist-template-tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const task = await db.checklistTemplateTask.findUnique({ where: { id } });
    if (!task) {
      return res.status(404).json({ error: "Template task not found" });
    }

    await db.checklistTemplateTask.delete({ where: { id } });
    return res.json({
      success: true,
      message: "Template task deleted successfully",
    });
  } catch (error) {
    console.error("DELETE template task error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────
// Time Off Routes

// GET /api/time-off/requests
app.get("/api/time-off/requests", async (req, res) => {
  try {
    const { userId, companyId, status } = req.query;
    const where: any = {};
    if (userId) where.userId = userId as string;
    if (companyId) where.companyId = companyId as string;
    if (status) where.status = status as string;

    const requests = await db.timeOffRequest.findMany({
      where,
      include: {
        policy: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { startDate: "desc" },
    });

    return res.json({ timeOffRequests: requests });
  } catch (error) {
    console.error("GET time-off requests error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/time-off/requests
app.post("/api/time-off/requests", async (req, res) => {
  try {
    const {
      userId,
      policyId,
      startDate,
      endDate,
      totalDays,
      reason,
      attachment,
      companyId,
    } = req.body;
    if (!userId || !policyId || !startDate || !endDate || !totalDays) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const newRequest = await db.timeOffRequest.create({
      data: {
        userId,
        policyId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        totalDays: parseFloat(totalDays),
        reason: reason || "",
        attachment: attachment || null,
        companyId: companyId || null,
        status: "PENDING",
      },
      include: { policy: true },
    });

    return res.status(201).json({ timeOffRequest: newRequest });
  } catch (error) {
    console.error("POST time-off request error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/time-off/requests/:id
app.put("/api/time-off/requests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const request = await db.timeOffRequest.findUnique({
      where: { id },
      include: { policy: true },
    });

    if (!request) {
      return res.status(404).json({ error: "Time off request not found" });
    }

    const updatedRequest = await db.timeOffRequest.update({
      where: { id },
      data: { status },
    });

    // If approved, update balance (simple logic for now)
    if (status === "APPROVED") {
      await db.timeOffBalance.upsert({
        where: {
          userId_policyId: {
            userId: request.userId,
            policyId: request.policyId,
          },
        },
        update: {
          balance: { decrement: request.totalDays },
        },
        create: {
          userId: request.userId,
          policyId: request.policyId,
          balance: -request.totalDays,
        },
      });
    }

    return res.json({ timeOffRequest: updatedRequest });
  } catch (error) {
    console.error("PUT time-off request error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/time-off/balances
app.get("/api/time-off/balances", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const balances = await db.timeOffBalance.findMany({
      where: { userId: userId as string },
      include: { policy: true },
    });

    return res.json({ timeOffBalances: balances });
  } catch (error) {
    console.error("GET time-off balances error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/time-off/policies
app.get("/api/time-off/policies", async (req, res) => {
  try {
    const { companyId } = req.query;
    const policies = await db.timeOffPolicy.findMany({
      where: companyId ? { companyId: companyId as string } : {},
    });

    // Seed default policies if none exist
    if (policies.length === 0 && companyId) {
      const defaultPolicies = [
        { name: "Annual", color: "#0FAF7A", companyId: companyId as string },
        {
          name: "Sick Leave",
          color: "#F43F5E",
          companyId: companyId as string,
        },
        {
          name: "Engagement",
          color: "#3B82F6",
          companyId: companyId as string,
        },
        { name: "Wedding", color: "#8B5CF6", companyId: companyId as string },
      ];
      await db.timeOffPolicy.createMany({ data: defaultPolicies });
      const newPolicies = await db.timeOffPolicy.findMany({
        where: { companyId: companyId as string },
      });
      return res.json({ timeOffPolicies: newPolicies });
    }

    return res.json({ timeOffPolicies: policies });
  } catch (error) {
    console.error("GET time-off policies error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/time-off/holidays
app.get("/api/time-off/holidays", async (req, res) => {
  try {
    const { companyId } = req.query;
    const holidays = await db.holiday.findMany({
      where: companyId ? { companyId: companyId as string } : {},
      orderBy: { date: "asc" },
    });
    return res.json({ holidays });
  } catch (error) {
    console.error("GET holidays error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/time-off/holidays
app.post("/api/time-off/holidays", async (req, res) => {
  try {
    const { name, date, companyId } = req.body;
    if (!name || !date) {
      return res.status(400).json({ error: "Name and date are required" });
    }
    const holiday = await db.holiday.create({
      data: {
        name,
        date: new Date(date),
        companyId: companyId || null,
      },
    });
    return res.status(201).json({ holiday });
  } catch (error) {
    console.error("POST holiday error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/time-off/holidays/:id
app.delete("/api/time-off/holidays/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await db.holiday.findUnique({ where: { id } });
    if (!holiday) {
      return res.status(404).json({ error: "Holiday not found" });
    }
    await db.holiday.delete({ where: { id } });
    return res.json({ success: true, message: "Holiday deleted successfully" });
  } catch (error) {
    console.error("DELETE holiday error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/time-off/policies
app.post("/api/time-off/policies", async (req, res) => {
  try {
    const { name, description, accrualRate, maxBalance, color, companyId } = req.body;
    if (!name || !companyId) {
      return res.status(400).json({ error: "Name and companyId are required" });
    }
    const policy = await db.timeOffPolicy.create({
      data: {
        name,
        description: description || null,
        accrualRate: accrualRate ? parseFloat(accrualRate) : 0,
        maxBalance: maxBalance ? parseFloat(maxBalance) : null,
        color: color || "#0FAF7A",
        companyId,
      },
    });
    return res.status(201).json({ timeOffPolicy: policy });
  } catch (error) {
    console.error("POST time-off policy error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/time-off/policies/:id
app.delete("/api/time-off/policies/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const policy = await db.timeOffPolicy.findUnique({ where: { id } });
    if (!policy) {
      return res.status(404).json({ error: "Policy not found" });
    }
    await db.timeOffBalance.deleteMany({ where: { policyId: id } });
    await db.timeOffRequest.deleteMany({ where: { policyId: id } });
    await db.timeOffPolicy.delete({ where: { id } });
    return res.json({ success: true, message: "Policy deleted successfully" });
  } catch (error) {
    console.error("DELETE time-off policy error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/time-off/requests/:id
app.delete("/api/time-off/requests/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const request = await db.timeOffRequest.findUnique({
      where: { id },
      include: { policy: true },
    });

    if (!request) {
      return res.status(404).json({ error: "Time off request not found" });
    }

    if (request.status === "APPROVED") {
      await db.timeOffBalance.upsert({
        where: {
          userId_policyId: {
            userId: request.userId,
            policyId: request.policyId,
          },
        },
        update: {
          balance: { increment: request.totalDays },
        },
        create: {
          userId: request.userId,
          policyId: request.policyId,
          balance: request.totalDays,
        },
      });
    }

    await db.timeOffRequest.delete({
      where: { id },
    });

    return res.json({ success: true, message: "Request cancelled and deleted successfully" });
  } catch (error) {
    console.error("DELETE time-off request error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Health check endpoint

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
