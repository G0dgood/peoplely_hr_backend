"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_js_1 = require("./lib/db.js");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*", // Adjust this for production
        methods: ["GET", "POST"],
    },
});
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
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
        const user = await db_js_1.db.user.findUnique({
            where: { email: email.toLowerCase().trim() },
        });
        if (!user) {
            return res.status(401).json({
                error: "The email you entered is not registered, please check again",
            });
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
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
    }
    catch (error) {
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
        const existingCompany = await db_js_1.db.company.findUnique({
            where: { name: companyNameTrimmed },
        });
        if (existingCompany) {
            return res.status(400).json({
                error: "A company with this name already exists",
            });
        }
        const newCompany = await db_js_1.db.company.create({
            data: {
                name: companyNameTrimmed,
            },
        });
        return res.status(201).json({
            success: true,
            company: newCompany,
        });
    }
    catch (error) {
        console.error("Create company error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.get("/api/companies/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const company = await db_js_1.db.company.findUnique({
            where: { id },
        });
        if (!company) {
            return res.status(404).json({ error: "Company not found" });
        }
        return res.json({ company });
    }
    catch (error) {
        console.error("GET company error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.put("/api/companies/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, website, phone, email, overview } = req.body;
        const existingCompany = await db_js_1.db.company.findUnique({
            where: { id },
        });
        if (!existingCompany) {
            return res.status(404).json({ error: "Company not found" });
        }
        // If name is being changed, ensure it's unique
        if (name &&
            name.trim().toLowerCase() !== existingCompany.name.toLowerCase()) {
            const duplicateCompany = await db_js_1.db.company.findUnique({
                where: { name: name.trim() },
            });
            if (duplicateCompany) {
                return res
                    .status(400)
                    .json({ error: "A company with this name already exists" });
            }
        }
        const updatedCompany = await db_js_1.db.company.update({
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
    }
    catch (error) {
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
        const existingUser = await db_js_1.db.user.findUnique({
            where: { email: emailNormalized },
        });
        if (existingUser) {
            return res.status(400).json({
                error: "An account with this email address already exists",
            });
        }
        const companyExists = await db_js_1.db.company.findUnique({
            where: { id: companyId },
        });
        if (!companyExists) {
            return res.status(400).json({
                error: "Invalid company ID provided",
            });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const newUser = await db_js_1.db.user.create({
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
    }
    catch (error) {
        console.error("Register API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Employee Routes
// GET /api/employees (list with filters, search, and pagination)
app.get("/api/employees", async (req, res) => {
    try {
        const companyId = req.query.companyId || "";
        const search = req.query.search || "";
        const office = req.query.office || "";
        const role = req.query.role || "";
        const status = req.query.status || "";
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const where = {};
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
        const total = await db_js_1.db.employee.count({ where });
        const employees = await db_js_1.db.employee.findMany({
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
    }
    catch (error) {
        console.error("GET employees API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/employees (create new employee)
app.post("/api/employees", async (req, res) => {
    try {
        const { name, email, role, manager, department, office, status, account, avatar, companyId, } = req.body;
        if (!name || !email || !role || !department || !office) {
            return res.status(400).json({
                error: "Required fields (name, email, role, department, office) are missing",
            });
        }
        const existingEmp = await db_js_1.db.employee.findUnique({
            where: { email: email.toLowerCase().trim() },
        });
        if (existingEmp) {
            return res.status(400).json({
                error: "An employee with this email address already exists",
            });
        }
        const newEmployee = await db_js_1.db.employee.create({
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
    }
    catch (error) {
        console.error("POST employee API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/employees/:id (update employee details)
app.put("/api/employees/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, role, manager, department, office, status, account, avatar, } = req.body;
        const existingEmp = await db_js_1.db.employee.findUnique({
            where: { id },
        });
        if (!existingEmp) {
            return res.status(404).json({ error: "Employee not found" });
        }
        // If email is being changed, ensure it's not taken
        if (email &&
            email.toLowerCase().trim() !== existingEmp.email.toLowerCase().trim()) {
            const emailTaken = await db_js_1.db.employee.findUnique({
                where: { email: email.toLowerCase().trim() },
            });
            if (emailTaken) {
                return res
                    .status(400)
                    .json({ error: "Email is already in use by another employee" });
            }
        }
        const updatedEmployee = await db_js_1.db.employee.update({
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
    }
    catch (error) {
        console.error("PUT employee API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/employees/:id (get single employee details)
app.get("/api/employees/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = req.query.companyId || "";
        const employee = await db_js_1.db.employee.findUnique({
            where: { id },
        });
        if (!employee || (companyId && employee.companyId !== companyId)) {
            return res.status(404).json({ error: "Employee not found" });
        }
        return res.json({ employee });
    }
    catch (error) {
        console.error("GET employee by ID error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/employees/:id (delete employee)
app.delete("/api/employees/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const existingEmp = await db_js_1.db.employee.findUnique({
            where: { id },
        });
        if (!existingEmp) {
            return res.status(404).json({ error: "Employee not found" });
        }
        await db_js_1.db.employee.delete({
            where: { id },
        });
        return res.json({
            success: true,
            message: "Employee deleted successfully",
        });
    }
    catch (error) {
        console.error("DELETE employee API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Department Routes
// GET /api/departments (list all departments)
app.get("/api/departments", async (req, res) => {
    try {
        const companyId = req.query.companyId || "";
        const search = req.query.search || "";
        const where = {};
        if (companyId) {
            where.companyId = companyId;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
            ];
        }
        const departments = await db_js_1.db.department.findMany({
            where,
            orderBy: { name: "asc" },
        });
        return res.json({ departments });
    }
    catch (error) {
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
        const existingDept = await db_js_1.db.department.findFirst({
            where: { name: name.trim(), companyId: companyId || null },
        });
        if (existingDept) {
            return res
                .status(400)
                .json({ error: "A department with this name already exists" });
        }
        const newDept = await db_js_1.db.department.create({
            data: {
                name: name.trim(),
                parentDept: parentDept.trim(),
                description: description || "",
                leader: leader || "None",
                companyId: companyId || null,
            },
        });
        return res.status(201).json({ department: newDept });
    }
    catch (error) {
        console.error("POST department error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/departments/:id (delete department)
app.delete("/api/departments/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const existingDept = await db_js_1.db.department.findUnique({
            where: { id },
        });
        if (!existingDept) {
            return res.status(404).json({ error: "Department not found" });
        }
        await db_js_1.db.department.delete({
            where: { id },
        });
        return res.json({
            success: true,
            message: "Department deleted successfully",
        });
    }
    catch (error) {
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
        const existingDept = await db_js_1.db.department.findUnique({
            where: { id },
        });
        if (!existingDept) {
            return res.status(404).json({ error: "Department not found" });
        }
        // If changing name, ensure it is unique within the same company
        if (name.trim().toLowerCase() !== existingDept.name.toLowerCase()) {
            const duplicateDept = await db_js_1.db.department.findFirst({
                where: { name: name.trim(), companyId: existingDept.companyId },
            });
            if (duplicateDept) {
                return res
                    .status(400)
                    .json({ error: "A department with this name already exists" });
            }
        }
        const updatedDept = await db_js_1.db.department.update({
            where: { id },
            data: {
                name: name.trim(),
                parentDept: parentDept.trim(),
                description: description || "",
                leader: leader || "None",
            },
        });
        return res.json({ department: updatedDept });
    }
    catch (error) {
        console.error("PUT department error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Office Routes
// GET /api/offices (list all offices)
app.get("/api/offices", async (req, res) => {
    try {
        const companyId = req.query.companyId || "";
        const search = req.query.search || "";
        const where = {};
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
        const offices = await db_js_1.db.office.findMany({
            where,
            orderBy: { name: "asc" },
        });
        return res.json({ offices });
    }
    catch (error) {
        console.error("GET offices error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/offices (create office)
app.post("/api/offices", async (req, res) => {
    try {
        const { name, location, description, isHQ, active, timezone, phone, email, headOfOffice, companyId, } = req.body;
        if (!name || !location) {
            return res
                .status(400)
                .json({ error: "Required fields (name, location) are missing" });
        }
        const existingOffice = await db_js_1.db.office.findFirst({
            where: { name: name.trim(), companyId: companyId || null },
        });
        if (existingOffice) {
            return res
                .status(400)
                .json({ error: "An office with this name already exists" });
        }
        const newOffice = await db_js_1.db.office.create({
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
    }
    catch (error) {
        console.error("POST office error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/offices/:id (delete office)
app.delete("/api/offices/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const existingOffice = await db_js_1.db.office.findUnique({
            where: { id },
        });
        if (!existingOffice) {
            return res.status(404).json({ error: "Office not found" });
        }
        await db_js_1.db.office.delete({
            where: { id },
        });
        return res.json({ success: true, message: "Office deleted successfully" });
    }
    catch (error) {
        console.error("DELETE office error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/offices/:id (update office)
app.put("/api/offices/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, location, description, isHQ, active, timezone, phone, email, headOfOffice, } = req.body;
        if (!name || !location) {
            return res
                .status(400)
                .json({ error: "Required fields (name, location) are missing" });
        }
        const existingOffice = await db_js_1.db.office.findUnique({
            where: { id },
        });
        if (!existingOffice) {
            return res.status(404).json({ error: "Office not found" });
        }
        // If changing name, ensure it is unique within the same company
        if (name.trim().toLowerCase() !== existingOffice.name.toLowerCase()) {
            const duplicateOffice = await db_js_1.db.office.findFirst({
                where: { name: name.trim(), companyId: existingOffice.companyId },
            });
            if (duplicateOffice) {
                return res
                    .status(400)
                    .json({ error: "An office with this name already exists" });
            }
        }
        const updatedOffice = await db_js_1.db.office.update({
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
                headOfOffice: headOfOffice !== undefined
                    ? headOfOffice
                    : existingOffice.headOfOffice,
            },
        });
        return res.json({ office: updatedOffice });
    }
    catch (error) {
        console.error("PUT office error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Job Title Routes
// GET /api/job-titles (list all job titles)
app.get("/api/job-titles", async (req, res) => {
    try {
        const companyId = req.query.companyId || "";
        const search = req.query.search || "";
        const where = {};
        if (companyId) {
            where.companyId = companyId;
        }
        if (search) {
            where.title = { contains: search, mode: "insensitive" };
        }
        const jobTitles = await db_js_1.db.jobTitle.findMany({
            where,
            orderBy: { title: "asc" },
        });
        return res.json({ jobTitles });
    }
    catch (error) {
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
        const existingJob = await db_js_1.db.jobTitle.findFirst({
            where: { title: title.trim(), companyId: companyId || null },
        });
        if (existingJob) {
            return res
                .status(400)
                .json({ error: "A job title with this name already exists" });
        }
        const newJob = await db_js_1.db.jobTitle.create({
            data: {
                title: title.trim(),
                active: active !== undefined ? !!active : true,
                companyId: companyId || null,
            },
        });
        return res.status(201).json({ jobTitle: newJob });
    }
    catch (error) {
        console.error("POST job-titles error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/job-titles/:id (delete job title)
app.delete("/api/job-titles/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const existingJob = await db_js_1.db.jobTitle.findUnique({
            where: { id },
        });
        if (!existingJob) {
            return res.status(404).json({ error: "Job title not found" });
        }
        await db_js_1.db.jobTitle.delete({
            where: { id },
        });
        return res.json({
            success: true,
            message: "Job title deleted successfully",
        });
    }
    catch (error) {
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
        const existingJob = await db_js_1.db.jobTitle.findUnique({
            where: { id },
        });
        if (!existingJob) {
            return res.status(404).json({ error: "Job title not found" });
        }
        // If changing name, ensure it is unique within the same company
        if (title.trim().toLowerCase() !== existingJob.title.toLowerCase()) {
            const duplicateJob = await db_js_1.db.jobTitle.findFirst({
                where: { title: title.trim(), companyId: existingJob.companyId },
            });
            if (duplicateJob) {
                return res
                    .status(400)
                    .json({ error: "A job title with this name already exists" });
            }
        }
        const updatedJob = await db_js_1.db.jobTitle.update({
            where: { id },
            data: {
                title: title.trim(),
                active: active !== undefined ? !!active : existingJob.active,
            },
        });
        return res.json({ jobTitle: updatedJob });
    }
    catch (error) {
        console.error("PUT job-titles error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Work Schedule Routes
// GET /api/work-schedules
app.get("/api/work-schedules", async (req, res) => {
    try {
        const companyId = req.query.companyId || "";
        const where = {};
        if (companyId) {
            where.companyId = companyId;
        }
        const schedules = await db_js_1.db.workSchedule.findMany({
            where,
            include: { dailyHours: true },
            orderBy: { createdAt: "asc" },
        });
        return res.json({ workSchedules: schedules });
    }
    catch (error) {
        console.error("GET work-schedules error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/work-schedules
app.post("/api/work-schedules", async (req, res) => {
    try {
        const { title, isDefault, active, standardHours, effectiveFrom, type, totalHours, companyId, dailyHours, } = req.body;
        if (!title || !effectiveFrom) {
            return res
                .status(400)
                .json({ error: "Required fields (title, effectiveFrom) are missing" });
        }
        const newSchedule = await db_js_1.db.workSchedule.create({
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
                        ? dailyHours.map((d) => ({
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
    }
    catch (error) {
        console.error("POST work-schedules error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/work-schedules/:id
app.put("/api/work-schedules/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { title, isDefault, active, standardHours, effectiveFrom, type, totalHours, dailyHours, } = req.body;
        const existing = await db_js_1.db.workSchedule.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "Work schedule not found" });
        }
        const updated = await db_js_1.db.workSchedule.update({
            where: { id },
            data: {
                title: title !== undefined ? title.trim() : existing.title,
                isDefault: isDefault !== undefined ? !!isDefault : existing.isDefault,
                active: active !== undefined ? !!active : existing.active,
                standardHours: standardHours !== undefined ? standardHours : existing.standardHours,
                effectiveFrom: effectiveFrom !== undefined
                    ? effectiveFrom.trim()
                    : existing.effectiveFrom,
                type: type !== undefined ? type : existing.type,
                totalHours: totalHours !== undefined ? totalHours : existing.totalHours,
                ...(Array.isArray(dailyHours) && {
                    dailyHours: {
                        deleteMany: {},
                        create: dailyHours.map((d) => ({
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
    }
    catch (error) {
        console.error("PUT work-schedules error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/work-schedules/:id
app.delete("/api/work-schedules/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await db_js_1.db.workSchedule.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "Work schedule not found" });
        }
        await db_js_1.db.workSchedule.delete({ where: { id } });
        return res.json({
            success: true,
            message: "Work schedule deleted successfully",
        });
    }
    catch (error) {
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
        let companyId = req.query.companyId || "";
        if (!companyId) {
            const firstCompany = await db_js_1.db.company.findFirst();
            if (firstCompany) {
                companyId = firstCompany.id;
            }
            else {
                const defaultCompany = await db_js_1.db.company.create({
                    data: { name: "Default Company" },
                });
                companyId = defaultCompany.id;
            }
        }
        const roles = await db_js_1.db.role.findMany({
            where: { companyId },
            include: { permissions: true },
            orderBy: { createdAt: "asc" },
        });
        return res.json({ roles });
    }
    catch (error) {
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
            const firstCompany = await db_js_1.db.company.findFirst();
            if (firstCompany) {
                targetCompanyId = firstCompany.id;
            }
            else {
                const defaultCompany = await db_js_1.db.company.create({
                    data: { name: "Default Company" },
                });
                targetCompanyId = defaultCompany.id;
            }
        }
        // Check if role name already exists in company
        const existingRole = await db_js_1.db.role.findFirst({
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
        const newRole = await db_js_1.db.role.create({
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
    }
    catch (error) {
        console.error("POST roles error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/roles/:id
app.put("/api/roles/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, accessLevel, description, permissions } = req.body;
        const role = await db_js_1.db.role.findUnique({
            where: { id },
            include: { permissions: true },
        });
        if (!role) {
            return res.status(404).json({ error: "Role not found" });
        }
        const updateData = {};
        if (name !== undefined &&
            name.trim().toLowerCase() !== role.name.toLowerCase()) {
            const existing = await db_js_1.db.role.findFirst({
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
            await db_js_1.db.role.update({
                where: { id },
                data: updateData,
            });
        }
        // Update permissions if provided
        if (Array.isArray(permissions)) {
            for (const p of permissions) {
                if (p.section && p.accessType) {
                    // Find permission for this section
                    const existingPerm = role.permissions.find((rp) => rp.section.toLowerCase() === p.section.toLowerCase());
                    if (existingPerm) {
                        await db_js_1.db.rolePermission.update({
                            where: { id: existingPerm.id },
                            data: { accessType: p.accessType },
                        });
                    }
                    else {
                        // Create it if it somehow doesn't exist
                        await db_js_1.db.rolePermission.create({
                            data: {
                                roleId: id,
                                section: p.section,
                                accessType: p.accessType,
                            },
                        });
                    }
                }
                else if (p.id && p.accessType) {
                    await db_js_1.db.rolePermission.update({
                        where: { id: p.id },
                        data: { accessType: p.accessType },
                    });
                }
            }
        }
        // Fetch final updated role
        const finalRole = await db_js_1.db.role.findUnique({
            where: { id },
            include: { permissions: true },
        });
        return res.json({ role: finalRole });
    }
    catch (error) {
        console.error("PUT role error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/roles/:id
app.delete("/api/roles/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const role = await db_js_1.db.role.findUnique({ where: { id } });
        if (!role) {
            return res.status(404).json({ error: "Role not found" });
        }
        if (role.isDefault) {
            return res.status(400).json({ error: "Default roles cannot be deleted" });
        }
        await db_js_1.db.role.delete({ where: { id } });
        return res.json({ success: true, message: "Role deleted successfully" });
    }
    catch (error) {
        console.error("DELETE role error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/roles/:id/members
app.get("/api/roles/:id/members", async (req, res) => {
    try {
        const { id } = req.params;
        const role = await db_js_1.db.role.findUnique({ where: { id } });
        if (!role) {
            return res.status(404).json({ error: "Role not found" });
        }
        const members = await db_js_1.db.user.findMany({
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
        const eligibleUsers = await db_js_1.db.user.findMany({
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
    }
    catch (error) {
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
        const role = await db_js_1.db.role.findUnique({ where: { id } });
        if (!role) {
            return res.status(404).json({ error: "Role not found" });
        }
        const user = await db_js_1.db.user.findUnique({ where: { id: userId } });
        if (!user || user.companyId !== role.companyId) {
            return res.status(404).json({
                error: "User not found or does not belong to the same company",
            });
        }
        const updatedUser = await db_js_1.db.user.update({
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
    }
    catch (error) {
        console.error("POST role member error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/roles/:id/members/:userId
app.delete("/api/roles/:id/members/:userId", async (req, res) => {
    try {
        const { id, userId } = req.params;
        const user = await db_js_1.db.user.findUnique({ where: { id: userId } });
        if (!user || user.roleId !== id) {
            return res
                .status(404)
                .json({ error: "User not found or is not assigned to this role" });
        }
        await db_js_1.db.user.update({
            where: { id: userId },
            data: { roleId: null },
        });
        return res.json({
            success: true,
            message: "Member removed from role successfully",
        });
    }
    catch (error) {
        console.error("DELETE role member error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Checklist Tasks Routes
// GET /api/checklist-tasks
app.get("/api/checklist-tasks", async (req, res) => {
    try {
        let companyId = req.query.companyId || "";
        const search = req.query.search || "";
        const status = req.query.status || "";
        if (!companyId) {
            const firstCompany = await db_js_1.db.company.findFirst();
            if (firstCompany) {
                companyId = firstCompany.id;
            }
            else {
                const defaultCompany = await db_js_1.db.company.create({
                    data: { name: "Default Company" },
                });
                companyId = defaultCompany.id;
            }
        }
        const whereClause = { companyId };
        if (status === "Completed") {
            whereClause.completed = true;
        }
        else if (status === "In Progress") {
            whereClause.completed = false;
        }
        if (search) {
            whereClause.OR = [
                { taskName: { contains: search, mode: "insensitive" } },
                { employeeName: { contains: search, mode: "insensitive" } },
            ];
        }
        const filteredTasks = await db_js_1.db.checklistTask.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
        });
        return res.json({ checklistTasks: filteredTasks });
    }
    catch (error) {
        console.error("GET checklist tasks error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/checklist-tasks
app.post("/api/checklist-tasks", async (req, res) => {
    try {
        const { taskName, dueDate, employeeName, description, companyId } = req.body;
        if (!taskName || !dueDate || !employeeName) {
            return res
                .status(400)
                .json({ error: "taskName, dueDate, and employeeName are required" });
        }
        let targetCompanyId = companyId;
        if (!targetCompanyId) {
            const firstCompany = await db_js_1.db.company.findFirst();
            if (firstCompany) {
                targetCompanyId = firstCompany.id;
            }
            else {
                const defaultCompany = await db_js_1.db.company.create({
                    data: { name: "Default Company" },
                });
                targetCompanyId = defaultCompany.id;
            }
        }
        const initials = employeeName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
        const newTask = await db_js_1.db.checklistTask.create({
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
    }
    catch (error) {
        console.error("POST checklist task error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/checklist-tasks/:id
app.put("/api/checklist-tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { completed, taskName, dueDate, employeeName, description } = req.body;
        const task = await db_js_1.db.checklistTask.findUnique({ where: { id } });
        if (!task) {
            return res.status(404).json({ error: "Checklist task not found" });
        }
        const updateData = {};
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
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
            updateData.employeeInitials = initials || "EE";
        }
        if (description !== undefined) {
            updateData.description = description;
        }
        const updatedTask = await db_js_1.db.checklistTask.update({
            where: { id },
            data: updateData,
        });
        return res.json({ checklistTask: updatedTask });
    }
    catch (error) {
        console.error("PUT checklist task error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/checklist-tasks/:id
app.delete("/api/checklist-tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const task = await db_js_1.db.checklistTask.findUnique({ where: { id } });
        if (!task) {
            return res.status(404).json({ error: "Checklist task not found" });
        }
        await db_js_1.db.checklistTask.delete({ where: { id } });
        return res.json({
            success: true,
            message: "Checklist task deleted successfully",
        });
    }
    catch (error) {
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
        const participants = await db_js_1.db.participant.findMany({
            where: { userId: userId },
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
                const otherParticipant = conv.participants.find((part) => part.userId !== userId);
                name = otherParticipant?.user.name || "Unknown";
            }
            return {
                id: conv.id,
                name,
                avatar,
                preview: lastMessage?.text ||
                    (lastMessage?.image ? "Image" : lastMessage?.audio ? "Audio" : ""),
                time: lastMessage?.createdAt || conv.createdAt,
                unread: 0, // Placeholder
                online: false, // Placeholder
                isGroup: conv.isGroup,
            };
        });
        return res.json({ conversations });
    }
    catch (error) {
        console.error("GET conversations error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/conversations/:id/messages
app.get("/api/conversations/:id/messages", async (req, res) => {
    try {
        const { id } = req.params;
        const messages = await db_js_1.db.message.findMany({
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
    }
    catch (error) {
        console.error("GET messages error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/conversations
app.post("/api/conversations", async (req, res) => {
    try {
        const { participantIds, name, isGroup, companyId } = req.body;
        if (!participantIds ||
            !Array.isArray(participantIds) ||
            participantIds.length < 2) {
            return res
                .status(400)
                .json({ error: "At least two participants are required" });
        }
        const conversation = await db_js_1.db.conversation.create({
            data: {
                name: name || null,
                isGroup: !!isGroup,
                companyId: companyId || null,
                participants: {
                    create: participantIds.map((id) => ({
                        userId: id,
                    })),
                },
            },
            include: {
                participants: true,
            },
        });
        return res.status(201).json({ conversation });
    }
    catch (error) {
        console.error("POST conversation error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// News Routes
// ─────────────────────────────────────────────
// GET /api/news
app.get("/api/news", async (req, res) => {
    try {
        let companyId = req.query.companyId || "";
        const status = req.query.status || "";
        const search = req.query.search || "";
        if (!companyId) {
            const firstCompany = await db_js_1.db.company.findFirst();
            if (firstCompany) {
                companyId = firstCompany.id;
            }
            else {
                const defaultCompany = await db_js_1.db.company.create({
                    data: { name: "Default Company" },
                });
                companyId = defaultCompany.id;
            }
        }
        let newsItems = await db_js_1.db.news.findMany({
            where: { companyId },
            orderBy: { createdAt: "desc" },
        });
        // Apply filters
        if (status) {
            newsItems = newsItems.filter((n) => n.status.toUpperCase() === status.toUpperCase());
        }
        if (search) {
            const q = search.toLowerCase();
            newsItems = newsItems.filter((n) => n.title.toLowerCase().includes(q) ||
                n.authorName.toLowerCase().includes(q));
        }
        return res.json({ news: newsItems });
    }
    catch (error) {
        console.error("GET news error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/news/:id
app.get("/api/news/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const newsItem = await db_js_1.db.news.findUnique({ where: { id } });
        if (!newsItem) {
            return res.status(404).json({ error: "News article not found" });
        }
        return res.json({ newsItem });
    }
    catch (error) {
        console.error("GET news/:id error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/news
app.post("/api/news", async (req, res) => {
    try {
        let { title, content, shareWith, status, authorName, authorAvatar, companyId, } = req.body;
        if (!title) {
            return res.status(400).json({ error: "title is required" });
        }
        if (!companyId) {
            const firstCompany = await db_js_1.db.company.findFirst();
            companyId = firstCompany?.id || "";
        }
        const newsItem = await db_js_1.db.news.create({
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
    }
    catch (error) {
        console.error("POST news error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/news/:id
app.put("/api/news/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, shareWith, status, authorName, authorAvatar } = req.body;
        const existing = await db_js_1.db.news.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "News article not found" });
        }
        const newsItem = await db_js_1.db.news.update({
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
    }
    catch (error) {
        console.error("PUT news/:id error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/news/:id
app.delete("/api/news/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await db_js_1.db.news.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: "News article not found" });
        }
        await db_js_1.db.news.delete({ where: { id } });
        return res.json({
            success: true,
            message: "News article deleted successfully",
        });
    }
    catch (error) {
        console.error("DELETE news/:id error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Checklist Templates Routes
// GET /api/checklist-templates
app.get("/api/checklist-templates", async (req, res) => {
    try {
        let companyId = req.query.companyId || "";
        const type = req.query.type || "";
        if (!companyId) {
            const firstCompany = await db_js_1.db.company.findFirst();
            if (firstCompany) {
                companyId = firstCompany.id;
            }
            else {
                const defaultCompany = await db_js_1.db.company.create({
                    data: { name: "Default Company" },
                });
                companyId = defaultCompany.id;
            }
        }
        let templates = await db_js_1.db.checklistTemplate.findMany({
            where: { companyId },
            include: { tasks: true },
        });
        // Filter by type if provided
        if (type) {
            templates = templates.filter((t) => t.type.toLowerCase() === type.toLowerCase());
        }
        return res.json({ checklistTemplates: templates });
    }
    catch (error) {
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
            const firstCompany = await db_js_1.db.company.findFirst();
            if (firstCompany) {
                targetCompanyId = firstCompany.id;
            }
            else {
                const defaultCompany = await db_js_1.db.company.create({
                    data: { name: "Default Company" },
                });
                targetCompanyId = defaultCompany.id;
            }
        }
        const newTemplate = await db_js_1.db.checklistTemplate.create({
            data: {
                name,
                description: description || "",
                type: type.toLowerCase(),
                companyId: targetCompanyId,
            },
        });
        return res.status(201).json({ checklistTemplate: newTemplate });
    }
    catch (error) {
        console.error("POST checklist template error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/checklist-templates/:id
app.get("/api/checklist-templates/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const template = await db_js_1.db.checklistTemplate.findUnique({
            where: { id },
            include: { tasks: true },
        });
        if (!template) {
            return res.status(404).json({ error: "Checklist template not found" });
        }
        return res.json({ checklistTemplate: template });
    }
    catch (error) {
        console.error("GET checklist template error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/checklist-templates/:id
app.delete("/api/checklist-templates/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const template = await db_js_1.db.checklistTemplate.findUnique({ where: { id } });
        if (!template) {
            return res.status(404).json({ error: "Checklist template not found" });
        }
        await db_js_1.db.checklistTemplate.delete({ where: { id } });
        return res.json({
            success: true,
            message: "Template deleted successfully",
        });
    }
    catch (error) {
        console.error("DELETE checklist template error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/checklist-templates/:id/tasks
app.get("/api/checklist-templates/:id/tasks", async (req, res) => {
    try {
        const { id } = req.params;
        const template = await db_js_1.db.checklistTemplate.findUnique({ where: { id } });
        if (!template) {
            return res.status(404).json({ error: "Checklist template not found" });
        }
        const tasks = await db_js_1.db.checklistTemplateTask.findMany({
            where: { templateId: id },
            orderBy: { createdAt: "asc" },
        });
        return res.json({ tasks });
    }
    catch (error) {
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
        const template = await db_js_1.db.checklistTemplate.findUnique({ where: { id } });
        if (!template) {
            return res.status(404).json({ error: "Checklist template not found" });
        }
        const newTask = await db_js_1.db.checklistTemplateTask.create({
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
    }
    catch (error) {
        console.error("POST template task error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/checklist-template-tasks/:id
app.put("/api/checklist-template-tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, tag, assignee, dueDate, description } = req.body;
        const task = await db_js_1.db.checklistTemplateTask.findUnique({ where: { id } });
        if (!task) {
            return res.status(404).json({ error: "Template task not found" });
        }
        const updateData = {};
        if (name !== undefined)
            updateData.name = name;
        if (tag !== undefined)
            updateData.tag = tag;
        if (assignee !== undefined)
            updateData.assignee = assignee;
        if (dueDate !== undefined)
            updateData.dueDate = dueDate;
        if (description !== undefined)
            updateData.description = description;
        const updatedTask = await db_js_1.db.checklistTemplateTask.update({
            where: { id },
            data: updateData,
        });
        return res.json({ task: updatedTask });
    }
    catch (error) {
        console.error("PUT template task error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/checklist-template-tasks/:id
app.delete("/api/checklist-template-tasks/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const task = await db_js_1.db.checklistTemplateTask.findUnique({ where: { id } });
        if (!task) {
            return res.status(404).json({ error: "Template task not found" });
        }
        await db_js_1.db.checklistTemplateTask.delete({ where: { id } });
        return res.json({
            success: true,
            message: "Template task deleted successfully",
        });
    }
    catch (error) {
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
        const where = {};
        if (userId)
            where.userId = userId;
        if (companyId)
            where.companyId = companyId;
        if (status)
            where.status = status;
        const requests = await db_js_1.db.timeOffRequest.findMany({
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
    }
    catch (error) {
        console.error("GET time-off requests error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/time-off/requests
app.post("/api/time-off/requests", async (req, res) => {
    try {
        const { userId, policyId, startDate, endDate, totalDays, reason, attachment, companyId, } = req.body;
        if (!userId || !policyId || !startDate || !endDate || !totalDays) {
            return res.status(400).json({ error: "Missing required fields" });
        }
        const newRequest = await db_js_1.db.timeOffRequest.create({
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
    }
    catch (error) {
        console.error("POST time-off request error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/time-off/requests/:id
app.put("/api/time-off/requests/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const request = await db_js_1.db.timeOffRequest.findUnique({
            where: { id },
            include: { policy: true },
        });
        if (!request) {
            return res.status(404).json({ error: "Time off request not found" });
        }
        const updatedRequest = await db_js_1.db.timeOffRequest.update({
            where: { id },
            data: { status },
        });
        // If approved, update balance (simple logic for now)
        if (status === "APPROVED") {
            await db_js_1.db.timeOffBalance.upsert({
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
    }
    catch (error) {
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
        const balances = await db_js_1.db.timeOffBalance.findMany({
            where: { userId: userId },
            include: { policy: true },
        });
        return res.json({ timeOffBalances: balances });
    }
    catch (error) {
        console.error("GET time-off balances error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/time-off/policies
app.get("/api/time-off/policies", async (req, res) => {
    try {
        const { companyId } = req.query;
        const policies = await db_js_1.db.timeOffPolicy.findMany({
            where: companyId ? { companyId: companyId } : {},
        });
        // Seed default policies if none exist
        if (policies.length === 0 && companyId) {
            const defaultPolicies = [
                { name: "Annual", color: "#0FAF7A", companyId: companyId },
                {
                    name: "Sick Leave",
                    color: "#F43F5E",
                    companyId: companyId,
                },
                {
                    name: "Engagement",
                    color: "#3B82F6",
                    companyId: companyId,
                },
                { name: "Wedding", color: "#8B5CF6", companyId: companyId },
            ];
            await db_js_1.db.timeOffPolicy.createMany({ data: defaultPolicies });
            const newPolicies = await db_js_1.db.timeOffPolicy.findMany({
                where: { companyId: companyId },
            });
            return res.json({ timeOffPolicies: newPolicies });
        }
        return res.json({ timeOffPolicies: policies });
    }
    catch (error) {
        console.error("GET time-off policies error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/time-off/holidays
app.get("/api/time-off/holidays", async (req, res) => {
    try {
        const { companyId } = req.query;
        const holidays = await db_js_1.db.holiday.findMany({
            where: companyId ? { companyId: companyId } : {},
            orderBy: { date: "asc" },
        });
        return res.json({ holidays });
    }
    catch (error) {
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
        const holiday = await db_js_1.db.holiday.create({
            data: {
                name,
                date: new Date(date),
                companyId: companyId || null,
            },
        });
        return res.status(201).json({ holiday });
    }
    catch (error) {
        console.error("POST holiday error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/time-off/holidays/:id
app.delete("/api/time-off/holidays/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const holiday = await db_js_1.db.holiday.findUnique({ where: { id } });
        if (!holiday) {
            return res.status(404).json({ error: "Holiday not found" });
        }
        await db_js_1.db.holiday.delete({ where: { id } });
        return res.json({ success: true, message: "Holiday deleted successfully" });
    }
    catch (error) {
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
        const policy = await db_js_1.db.timeOffPolicy.create({
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
    }
    catch (error) {
        console.error("POST time-off policy error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/time-off/policies/:id
app.delete("/api/time-off/policies/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const policy = await db_js_1.db.timeOffPolicy.findUnique({ where: { id } });
        if (!policy) {
            return res.status(404).json({ error: "Policy not found" });
        }
        await db_js_1.db.timeOffBalance.deleteMany({ where: { policyId: id } });
        await db_js_1.db.timeOffRequest.deleteMany({ where: { policyId: id } });
        await db_js_1.db.timeOffPolicy.delete({ where: { id } });
        return res.json({ success: true, message: "Policy deleted successfully" });
    }
    catch (error) {
        console.error("DELETE time-off policy error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/time-off/requests/:id
app.delete("/api/time-off/requests/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const request = await db_js_1.db.timeOffRequest.findUnique({
            where: { id },
            include: { policy: true },
        });
        if (!request) {
            return res.status(404).json({ error: "Time off request not found" });
        }
        if (request.status === "APPROVED") {
            await db_js_1.db.timeOffBalance.upsert({
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
        await db_js_1.db.timeOffRequest.delete({
            where: { id },
        });
        return res.json({ success: true, message: "Request cancelled and deleted successfully" });
    }
    catch (error) {
        console.error("DELETE time-off request error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// ==========================================
// Attendance Routes
// ==========================================
// GET /api/attendance
app.get("/api/attendance", async (req, res) => {
    try {
        const userId = req.query.userId || "";
        const companyId = req.query.companyId || "";
        const search = req.query.search || "";
        const status = req.query.status || "";
        const recordType = req.query.recordType || "";
        const location = req.query.location || "";
        const dateRange = req.query.dateRange || "";
        const where = {};
        if (userId) {
            where.userId = userId;
        }
        if (companyId) {
            where.companyId = companyId;
        }
        if (status && status !== "All Status") {
            if (status === "PENDING" || status === "APPROVED") {
                where.status = status;
            }
            else if (status === "On Time" || status === "Late") {
                where.isPositive = true;
            }
            else if (status === "Deficit") {
                where.isPositive = false;
            }
        }
        if (recordType && recordType !== "All Record") {
            if (recordType === "Overtime Shifts") {
                where.NOT = { overtime: "0m" };
            }
            else if (recordType === "Regular Shifts") {
                where.overtime = "0m";
            }
        }
        if (location && location !== "All Location") {
            where.OR = [
                { clockInLoc: { contains: location, mode: "insensitive" } },
                { clockOutLoc: { contains: location, mode: "insensitive" } },
            ];
        }
        if (search) {
            where.user = {
                name: { contains: search, mode: "insensitive" }
            };
        }
        const records = await db_js_1.db.attendanceRecord.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        let filteredRecords = records;
        if (dateRange) {
            const parseDate = (dStr) => {
                const parsed = Date.parse(dStr);
                return isNaN(parsed) ? new Date(dStr) : new Date(parsed);
            };
            if (dateRange.includes(" - ")) {
                const [startStr, endStr] = dateRange.split(" - ");
                const startDate = parseDate(startStr);
                startDate.setHours(0, 0, 0, 0);
                const endDate = parseDate(endStr);
                endDate.setHours(23, 59, 59, 999);
                filteredRecords = records.filter(r => {
                    const rDate = parseDate(r.date);
                    return rDate >= startDate && rDate <= endDate;
                });
            }
            else {
                const targetDate = parseDate(dateRange);
                targetDate.setHours(0, 0, 0, 0);
                filteredRecords = records.filter(r => {
                    const rDate = parseDate(r.date);
                    rDate.setHours(0, 0, 0, 0);
                    return rDate.getTime() === targetDate.getTime();
                });
            }
        }
        return res.json({ attendanceRecords: filteredRecords });
    }
    catch (error) {
        console.error("GET attendance records error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/attendance/clock-in
app.post("/api/attendance/clock-in", async (req, res) => {
    try {
        const { userId, clockInLoc, notes, device, ipAddress, companyId } = req.body;
        if (!userId) {
            return res.status(400).json({ error: "User ID is required" });
        }
        const activeRecord = await db_js_1.db.attendanceRecord.findFirst({
            where: {
                userId,
                clockOut: null,
            }
        });
        if (activeRecord) {
            return res.status(400).json({ error: "User is already clocked in" });
        }
        let targetCompanyId = companyId;
        if (!targetCompanyId && userId) {
            const userObj = await db_js_1.db.user.findUnique({ where: { id: userId } });
            targetCompanyId = userObj?.companyId || "";
        }
        if (targetCompanyId) {
            const settings = await db_js_1.db.attendanceSetting.findUnique({
                where: { companyId: targetCompanyId }
            });
            if (settings && settings.officeGeofencing === "Active" && settings.officePolicy === "Not allow clock in/out outside the office") {
                if ((clockInLoc || "Remote") === "Remote") {
                    return res.status(400).json({ error: "Clock in outside the office is not allowed by policy." });
                }
            }
        }
        const now = new Date();
        const dateString = now.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
        const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (GMT+1)";
        const newRecord = await db_js_1.db.attendanceRecord.create({
            data: {
                userId,
                date: dateString,
                clockIn: timeString,
                clockInLoc: clockInLoc || "Remote",
                schedule: "8h",
                logged: "0h 00m 00s",
                paid: "0h",
                overtime: "0m",
                status: "PENDING",
                isPositive: false,
                notes: notes || "",
                device: device || "Web Browser",
                ipAddress: ipAddress || "",
                companyId: companyId || null,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            }
        });
        return res.status(201).json({ attendanceRecord: newRecord });
    }
    catch (error) {
        console.error("POST clock-in error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/attendance/clock-out/:id
app.post("/api/attendance/clock-out/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { clockOutLoc, notes } = req.body;
        const record = await db_js_1.db.attendanceRecord.findUnique({
            where: { id }
        });
        if (!record) {
            return res.status(404).json({ error: "Attendance record not found" });
        }
        if (record.clockOut) {
            return res.status(400).json({ error: "User is already clocked out" });
        }
        let companyId = record.companyId;
        if (!companyId) {
            const userObj = await db_js_1.db.user.findUnique({
                where: { id: record.userId }
            });
            companyId = userObj?.companyId || null;
        }
        let totalHoursCalculation = "Every Valid Check-in & Check-out";
        if (companyId) {
            const settings = await db_js_1.db.attendanceSetting.findUnique({
                where: { companyId }
            });
            if (settings) {
                totalHoursCalculation = settings.totalHoursCalculation;
                if (settings.officeGeofencing === "Active" && settings.officePolicy === "Not allow clock in/out outside the office") {
                    const outLoc = clockOutLoc || record.clockInLoc;
                    if ((outLoc || "Remote") === "Remote") {
                        return res.status(400).json({ error: "Clock out outside the office is not allowed by policy." });
                    }
                }
            }
        }
        const now = new Date();
        let diffSecs = 0;
        if (totalHoursCalculation === "First Check-in & Last Check-out") {
            const sameDayRecords = await db_js_1.db.attendanceRecord.findMany({
                where: {
                    userId: record.userId,
                    date: record.date
                },
                orderBy: {
                    createdAt: 'asc'
                }
            });
            const firstRecord = sameDayRecords[0] || record;
            const clockInTime = new Date(firstRecord.createdAt);
            const diffMs = now.getTime() - clockInTime.getTime();
            diffSecs = Math.max(0, Math.floor(diffMs / 1000));
        }
        else {
            const clockInTime = new Date(record.createdAt);
            const diffMs = now.getTime() - clockInTime.getTime();
            diffSecs = Math.max(0, Math.floor(diffMs / 1000));
        }
        if (totalHoursCalculation === "Fixed Working Hours Only") {
            diffSecs = Math.min(diffSecs, 28800); // Capped at 8 hours
        }
        const hrs = Math.floor(diffSecs / 3600);
        const mins = Math.floor((diffSecs % 3600) / 60);
        const secs = diffSecs % 60;
        const loggedStr = `${hrs}h ${mins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
        let isPositive = false;
        let overtimeStr = "0m";
        let paidStr = "0h";
        if (totalHoursCalculation === "Fixed Working Hours Only") {
            isPositive = false;
            overtimeStr = "0m";
            paidStr = `${hrs}h`;
        }
        else {
            isPositive = diffSecs >= 28800;
            const diffMins = Math.round((diffSecs - 28800) / 60);
            overtimeStr = isPositive ? `+ ${diffMins}m` : `-${Math.abs(diffMins)}m`;
            paidStr = diffSecs >= 28800 ? "8h" : `${hrs}h`;
        }
        const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " (GMT+1)";
        const updatedRecord = await db_js_1.db.attendanceRecord.update({
            where: { id },
            data: {
                clockOut: timeString,
                clockOutLoc: clockOutLoc || record.clockInLoc,
                logged: loggedStr,
                paid: paidStr,
                overtime: overtimeStr,
                isPositive,
                notes: notes || record.notes,
                status: "PENDING",
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            }
        });
        return res.json({ attendanceRecord: updatedRecord });
    }
    catch (error) {
        console.error("POST clock-out error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/attendance/:id
app.put("/api/attendance/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { paid, status, notes } = req.body;
        const record = await db_js_1.db.attendanceRecord.findUnique({
            where: { id }
        });
        if (!record) {
            return res.status(404).json({ error: "Attendance record not found" });
        }
        const dataToUpdate = {};
        if (paid !== undefined) {
            dataToUpdate.paid = paid;
        }
        if (status !== undefined) {
            dataToUpdate.status = status;
        }
        if (notes !== undefined) {
            dataToUpdate.notes = notes;
        }
        const updatedRecord = await db_js_1.db.attendanceRecord.update({
            where: { id },
            data: dataToUpdate,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            }
        });
        return res.json({ attendanceRecord: updatedRecord });
    }
    catch (error) {
        console.error("PUT attendance record error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/attendance/settings
app.get("/api/attendance/settings", async (req, res) => {
    try {
        const companyId = req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ error: "Company ID is required" });
        }
        let settings = await db_js_1.db.attendanceSetting.findUnique({
            where: { companyId }
        });
        if (!settings) {
            settings = await db_js_1.db.attendanceSetting.create({
                data: {
                    companyId,
                    totalHoursCalculation: "Every Valid Check-in & Check-out",
                    startDate: "11 Feb 2023",
                    approvalCycleValue: "1",
                    approvalCyclePeriod: "Monthly",
                    repeatOn: "Monthly on Day 11",
                    location: "All Offices",
                    officeName: "Unpixel Office",
                    officeChannels: "Desktop, Mobile",
                    officeQrCode: "Yes",
                    officeGeofencing: "Active",
                    officeAddress: "100 Queen St W, Toronto, ON M5H 2N3, Kanada",
                    officeRadius: "1 kilometers",
                    officePolicy: "Not allow clock in/out outside the office",
                    qrAutoGenerateValue: "5",
                    qrAutoGeneratePeriod: "Second",
                    qrSecurityType: "Public URL for Everyone"
                }
            });
        }
        return res.json({ attendanceSetting: settings });
    }
    catch (error) {
        console.error("GET attendance settings error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/attendance/settings
app.put("/api/attendance/settings", async (req, res) => {
    try {
        const { companyId, ...fields } = req.body;
        if (!companyId) {
            return res.status(400).json({ error: "Company ID is required" });
        }
        const settings = await db_js_1.db.attendanceSetting.upsert({
            where: { companyId },
            update: fields,
            create: {
                companyId,
                ...fields
            }
        });
        return res.json({ attendanceSetting: settings });
    }
    catch (error) {
        console.error("PUT attendance settings error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// ─── Payroll Routes ──────────────────────────────────────────────────
// GET /api/payroll
app.get("/api/payroll", async (req, res) => {
    try {
        const { companyId, search, department, status } = req.query;
        let targetCompanyId = companyId;
        if (!targetCompanyId) {
            const firstCompany = await db_js_1.db.company.findFirst();
            if (firstCompany) {
                targetCompanyId = firstCompany.id;
            }
            else {
                const defaultCompany = await db_js_1.db.company.create({
                    data: { name: "Default Company" }
                });
                targetCompanyId = defaultCompany.id;
            }
        }
        const where = { companyId: targetCompanyId };
        if (status && status !== "All Status") {
            where.status = status.toUpperCase();
        }
        const records = await db_js_1.db.payrollRecord.findMany({
            where,
            include: {
                user: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        let payrolls = await Promise.all(records.map(async (rec) => {
            const employee = await db_js_1.db.employee.findUnique({
                where: { email: rec.user.email }
            });
            return {
                id: rec.id,
                userId: rec.userId,
                name: rec.user.name,
                email: rec.user.email,
                fallback: rec.user.name.split(" ").map(n => n[0]).join("").toUpperCase(),
                department: employee?.department || "Design",
                jobTitle: employee?.role || rec.title,
                baseSalary: `$${rec.baseSalary.toLocaleString()}`,
                bonus: `$${rec.bonus.toLocaleString()}`,
                deductions: `$${rec.deductions.toLocaleString()}`,
                netPay: `$${rec.netPay.toLocaleString()}`,
                period: rec.period,
                status: rec.status,
                employmentType: rec.employmentType,
                geofencing: rec.geofencing,
                jobDate: rec.jobDate,
                lastWorkingDate: rec.lastWorkingDate,
                bankInfo: {
                    bankName: rec.bankName,
                    accountName: rec.accountName,
                    branch: rec.branch,
                    accountNumber: rec.accountNumber,
                    swiftBic: rec.swiftBic,
                    iban: rec.iban
                }
            };
        }));
        if (search) {
            const query = search.toLowerCase();
            payrolls = payrolls.filter(p => p.name.toLowerCase().includes(query) || p.email.toLowerCase().includes(query));
        }
        if (department && department !== "All Departments") {
            payrolls = payrolls.filter(p => p.department.toLowerCase() === department.toLowerCase());
        }
        return res.json({ payrollRecords: payrolls });
    }
    catch (error) {
        console.error("GET payroll records error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/payroll/:id
app.get("/api/payroll/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const rec = await db_js_1.db.payrollRecord.findUnique({
            where: { id },
            include: { user: true }
        });
        if (!rec) {
            return res.status(404).json({ error: "Payroll record not found" });
        }
        const employee = await db_js_1.db.employee.findUnique({
            where: { email: rec.user.email }
        });
        return res.json({
            payrollRecord: {
                id: rec.id,
                userId: rec.userId,
                name: rec.user.name,
                email: rec.user.email,
                fallback: rec.user.name.split(" ").map(n => n[0]).join("").toUpperCase(),
                department: employee?.department || "Design",
                jobTitle: employee?.role || rec.title,
                baseSalary: `$${rec.baseSalary.toLocaleString()}`,
                bonus: `$${rec.bonus.toLocaleString()}`,
                deductions: `$${rec.deductions.toLocaleString()}`,
                netPay: `$${rec.netPay.toLocaleString()}`,
                period: rec.period,
                status: rec.status,
                employmentType: rec.employmentType,
                geofencing: rec.geofencing,
                jobDate: rec.jobDate,
                lastWorkingDate: rec.lastWorkingDate,
                bankInfo: {
                    bankName: rec.bankName,
                    accountName: rec.accountName,
                    branch: rec.branch,
                    accountNumber: rec.accountNumber,
                    swiftBic: rec.swiftBic,
                    iban: rec.iban
                }
            }
        });
    }
    catch (error) {
        console.error("GET payroll record detail error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/payroll/:id
app.put("/api/payroll/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { baseSalary, bonus, deductions, status, employmentType, geofencing, title, jobDate, lastWorkingDate, bankName, accountName, branch, accountNumber, swiftBic, iban } = req.body;
        const record = await db_js_1.db.payrollRecord.findUnique({ where: { id } });
        if (!record) {
            return res.status(404).json({ error: "Payroll record not found" });
        }
        const dataToUpdate = {};
        if (baseSalary !== undefined)
            dataToUpdate.baseSalary = parseFloat(baseSalary.toString().replace(/[$,]/g, "")) || 0;
        if (bonus !== undefined)
            dataToUpdate.bonus = parseFloat(bonus.toString().replace(/[$,]/g, "")) || 0;
        if (deductions !== undefined)
            dataToUpdate.deductions = parseFloat(deductions.toString().replace(/[$,]/g, "")) || 0;
        // Automatically recalculate netPay if baseSalary, bonus, or deductions are updated
        const finalSalary = baseSalary !== undefined ? dataToUpdate.baseSalary : record.baseSalary;
        const finalBonus = bonus !== undefined ? dataToUpdate.bonus : record.bonus;
        const finalDeductions = deductions !== undefined ? dataToUpdate.deductions : record.deductions;
        dataToUpdate.netPay = finalSalary + finalBonus - finalDeductions;
        if (status !== undefined)
            dataToUpdate.status = status;
        if (employmentType !== undefined)
            dataToUpdate.employmentType = employmentType;
        if (geofencing !== undefined)
            dataToUpdate.geofencing = geofencing;
        if (title !== undefined)
            dataToUpdate.title = title;
        if (jobDate !== undefined)
            dataToUpdate.jobDate = jobDate;
        if (lastWorkingDate !== undefined)
            dataToUpdate.lastWorkingDate = lastWorkingDate;
        if (bankName !== undefined)
            dataToUpdate.bankName = bankName;
        if (accountName !== undefined)
            dataToUpdate.accountName = accountName;
        if (branch !== undefined)
            dataToUpdate.branch = branch;
        if (accountNumber !== undefined)
            dataToUpdate.accountNumber = accountNumber;
        if (swiftBic !== undefined)
            dataToUpdate.swiftBic = swiftBic;
        if (iban !== undefined)
            dataToUpdate.iban = iban;
        const updated = await db_js_1.db.payrollRecord.update({
            where: { id },
            data: dataToUpdate,
            include: { user: true }
        });
        const employee = await db_js_1.db.employee.findUnique({
            where: { email: updated.user.email }
        });
        return res.json({
            payrollRecord: {
                id: updated.id,
                userId: updated.userId,
                name: updated.user.name,
                email: updated.user.email,
                fallback: updated.user.name.split(" ").map(n => n[0]).join("").toUpperCase(),
                department: employee?.department || "Design",
                jobTitle: employee?.role || updated.title,
                baseSalary: `$${updated.baseSalary.toLocaleString()}`,
                bonus: `$${updated.bonus.toLocaleString()}`,
                deductions: `$${updated.deductions.toLocaleString()}`,
                netPay: `$${updated.netPay.toLocaleString()}`,
                period: updated.period,
                status: updated.status,
                employmentType: updated.employmentType,
                geofencing: updated.geofencing,
                jobDate: updated.jobDate,
                lastWorkingDate: updated.lastWorkingDate,
                bankInfo: {
                    bankName: updated.bankName,
                    accountName: updated.accountName,
                    branch: updated.branch,
                    accountNumber: updated.accountNumber,
                    swiftBic: updated.swiftBic,
                    iban: updated.iban
                }
            }
        });
    }
    catch (error) {
        console.error("PUT payroll record error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/payroll/:id
app.delete("/api/payroll/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db_js_1.db.payrollRecord.delete({ where: { id } });
        return res.json({ success: true, message: "Payroll record deleted successfully" });
    }
    catch (error) {
        console.error("DELETE payroll record error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/payroll/settings
app.get("/api/payroll/settings", async (req, res) => {
    try {
        const companyId = req.query.companyId;
        if (!companyId) {
            return res.status(400).json({ error: "Company ID is required" });
        }
        let settings = await db_js_1.db.payrollSetting.findUnique({
            where: { companyId }
        });
        if (!settings) {
            settings = await db_js_1.db.payrollSetting.create({
                data: {
                    companyId
                }
            });
        }
        return res.json({ payrollSetting: settings });
    }
    catch (error) {
        console.error("GET payroll settings error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/payroll/settings
app.put("/api/payroll/settings", async (req, res) => {
    try {
        const { companyId, ...fields } = req.body;
        if (!companyId) {
            return res.status(400).json({ error: "Company ID is required" });
        }
        const settings = await db_js_1.db.payrollSetting.upsert({
            where: { companyId },
            update: fields,
            create: {
                companyId,
                ...fields
            }
        });
        return res.json({ payrollSetting: settings });
    }
    catch (error) {
        console.error("PUT payroll settings error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// ─── Recruitment Routes ──────────────────────────────────────────────
// Helper to get default company ID
async function getRecruitmentCompanyId(companyId) {
    if (companyId)
        return companyId;
    const firstCompany = await db_js_1.db.company.findFirst();
    if (firstCompany)
        return firstCompany.id;
    const defaultCompany = await db_js_1.db.company.create({
        data: { name: "Default Company" }
    });
    return defaultCompany.id;
}
// GET /api/recruitment/jobs
app.get("/api/recruitment/jobs", async (req, res) => {
    try {
        const { companyId: qCompanyId, search } = req.query;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        // Seed default jobs if none exist
        const count = await db_js_1.db.job.count({ where: { companyId } });
        if (count === 0) {
            const defaultJobs = [
                {
                    title: "3D Designer",
                    department: "Designer",
                    office: "Unpixel HQ",
                    status: "ACTIVE",
                    employmentType: "Fulltime",
                    quantity: 1,
                    closingDate: "30 Jun 2026",
                    description: "Looking for an experienced 3D designer.",
                    invitedMembers: [],
                    workflowStages: [
                        { name: "Applied", isLocked: true },
                        { name: "Screening", isLocked: false },
                        { name: "1st Interview", isLocked: false },
                        { name: "2nd Interview", isLocked: false },
                        { name: "Offered", isLocked: true },
                        { name: "Hired", isLocked: true },
                        { name: "Rejected", isLocked: true }
                    ]
                },
                {
                    title: "UI UX Designer",
                    department: "Designer",
                    office: "Unpixel HQ",
                    status: "ACTIVE",
                    employmentType: "Fulltime",
                    quantity: 2,
                    closingDate: "15 Jul 2026",
                    description: "Looking for a UI UX designer.",
                    invitedMembers: [
                        { name: "Pristia Candra", email: "calzoni@gmail.com", avatar: "https://i.pravatar.cc/150?u=pristia" }
                    ],
                    workflowStages: [
                        { name: "Applied", isLocked: true },
                        { name: "Screening", isLocked: false },
                        { name: "1st Interview", isLocked: false },
                        { name: "2nd Interview", isLocked: false },
                        { name: "Offered", isLocked: true },
                        { name: "Hired", isLocked: true },
                        { name: "Rejected", isLocked: true }
                    ]
                },
                {
                    title: "Senior Android Developer",
                    department: "IT",
                    office: "Unpixel Indonesia",
                    status: "CLOSED",
                    employmentType: "Fulltime",
                    quantity: 1,
                    closingDate: "01 Jun 2026",
                    description: "Looking for a senior Android developer.",
                    invitedMembers: [],
                    workflowStages: [
                        { name: "Applied", isLocked: true },
                        { name: "Screening", isLocked: false },
                        { name: "1st Interview", isLocked: false },
                        { name: "2nd Interview", isLocked: false },
                        { name: "Offered", isLocked: true },
                        { name: "Hired", isLocked: true },
                        { name: "Rejected", isLocked: true }
                    ]
                },
                {
                    title: "Senior Android Developer",
                    department: "IT",
                    office: "Unpixel Indonesia",
                    status: "UNACTIVE",
                    employmentType: "Fulltime",
                    quantity: 1,
                    closingDate: "10 Jun 2026",
                    description: "Looking for a senior Android developer.",
                    invitedMembers: [],
                    workflowStages: [
                        { name: "Applied", isLocked: true },
                        { name: "Screening", isLocked: false },
                        { name: "1st Interview", isLocked: false },
                        { name: "2nd Interview", isLocked: false },
                        { name: "Offered", isLocked: true },
                        { name: "Hired", isLocked: true },
                        { name: "Rejected", isLocked: true }
                    ]
                }
            ];
            for (const dj of defaultJobs) {
                await db_js_1.db.job.create({
                    data: {
                        ...dj,
                        companyId
                    }
                });
            }
        }
        const where = { companyId };
        if (search) {
            where.title = { contains: search, mode: "insensitive" };
        }
        const dbJobs = await db_js_1.db.job.findMany({
            where,
            include: {
                candidates: true
            },
            orderBy: { createdAt: "desc" }
        });
        const jobs = dbJobs.map((j) => {
            // Find candidate avatars from first 3 applied candidates
            const avatars = j.candidates.slice(0, 3).map((c) => c.avatar || "https://i.pravatar.cc/150");
            return {
                id: j.id,
                title: j.title,
                department: j.department,
                office: j.office,
                candidatesApplied: j.candidates.length,
                avatars,
                status: j.status,
                employmentType: j.employmentType,
                quantity: j.quantity,
                closingDate: j.closingDate,
                description: j.description,
                invitedMembers: j.invitedMembers,
                workflowStages: j.workflowStages,
                createdAt: "Just now" // Keep it standard for front-end rendering
            };
        });
        return res.json({ jobs });
    }
    catch (error) {
        console.error("GET jobs error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/recruitment/jobs/:id
app.get("/api/recruitment/jobs/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const j = await db_js_1.db.job.findUnique({
            where: { id },
            include: {
                candidates: true
            }
        });
        if (!j) {
            return res.status(404).json({ error: "Job not found" });
        }
        const job = {
            id: j.id,
            title: j.title,
            department: j.department,
            office: j.office,
            status: j.status,
            employmentType: j.employmentType,
            quantity: j.quantity,
            closingDate: j.closingDate,
            description: j.description,
            invitedMembers: j.invitedMembers,
            workflowStages: j.workflowStages,
            candidates: j.candidates.map((c) => ({
                id: c.id,
                name: c.name,
                email: c.email,
                avatar: c.avatar,
                fallback: c.name.split(" ").map((n) => n[0]).join("").toUpperCase(),
                phone: c.phone,
                cv: c.cv,
                createdDate: c.cv ? "CV.pdf" : null, // Front-end expects cv string or null
                stage: c.stage,
                overallRating: c.overallRating,
                evaluationText: c.evaluationText,
                comments: c.comments,
                activity: c.activity
            }))
        };
        return res.json({ job });
    }
    catch (error) {
        console.error("GET job details error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/recruitment/jobs
app.post("/api/recruitment/jobs", async (req, res) => {
    try {
        const { title, department, office, employmentType, quantity, closingDate, description, invitedMembers, workflowStages, companyId: qCompanyId } = req.body;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        const newJob = await db_js_1.db.job.create({
            data: {
                title,
                department,
                office,
                employmentType: employmentType || "Fulltime",
                quantity: quantity ? parseInt(quantity.toString()) : 1,
                closingDate: closingDate || "N/A",
                description: description || "",
                invitedMembers: invitedMembers || [],
                workflowStages: workflowStages || [
                    { name: "Applied", isLocked: true },
                    { name: "Screening", isLocked: false },
                    { name: "1st Interview", isLocked: false },
                    { name: "2nd Interview", isLocked: false },
                    { name: "Offered", isLocked: true },
                    { name: "Hired", isLocked: true },
                    { name: "Rejected", isLocked: true }
                ],
                companyId
            }
        });
        return res.json({ job: newJob });
    }
    catch (error) {
        console.error("POST job error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/recruitment/jobs/:id
app.put("/api/recruitment/jobs/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { title, department, office, employmentType, quantity, closingDate, description, invitedMembers, workflowStages, status } = req.body;
        const updatedJob = await db_js_1.db.job.update({
            where: { id },
            data: {
                title,
                department,
                office,
                employmentType,
                quantity: quantity ? parseInt(quantity.toString()) : undefined,
                closingDate,
                description,
                invitedMembers,
                workflowStages,
                status
            }
        });
        return res.json({ job: updatedJob });
    }
    catch (error) {
        console.error("PUT job error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/recruitment/jobs/:id
app.delete("/api/recruitment/jobs/:id", async (req, res) => {
    try {
        const { id } = req.params;
        // Delete candidates first to prevent FK violation
        await db_js_1.db.candidate.deleteMany({ where: { jobId: id } });
        await db_js_1.db.job.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("DELETE job error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/recruitment/candidates
app.get("/api/recruitment/candidates", async (req, res) => {
    try {
        const { companyId: qCompanyId, search, status } = req.query;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        // Seed default candidates if count is 0
        const count = await db_js_1.db.candidate.count({ where: { companyId } });
        if (count === 0) {
            // Find a job to associate with, if possible
            const someJob = await db_js_1.db.job.findFirst({ where: { companyId } });
            const defaultCandidates = [
                { name: "Pristia Candra", email: "lincoln@unpixel.com", avatar: "https://i.pravatar.cc/150?u=pristia", phone: "08092139441", jobTitle: "UI UX Designer", cv: "CV.pdf", stage: "Applied" },
                { name: "Hanna Baptista", email: "hanna@unpixel.com", avatar: "https://i.pravatar.cc/150?u=hanna", phone: "08092139441", jobTitle: "Designer", cv: "-", stage: "Screening" },
                { name: "Miracle Geidt", email: "miracle@unpixel.com", avatar: "https://i.pravatar.cc/150?u=miracle", phone: "08092139441", jobTitle: "Designer", cv: "CV.pdf", stage: "1st Interview" },
                { name: "Rayna Torff", email: "rayna@unpixel.com", avatar: "https://i.pravatar.cc/150?u=rayna", phone: "08092139441", jobTitle: "Designer", cv: "-", stage: "2nd Interview" },
                { name: "Giana Lipshutz", email: "giana@unpixel.com", avatar: "https://i.pravatar.cc/150?u=giana", phone: "08092139441", jobTitle: "Designer", cv: "-", stage: "Hiring" },
                { name: "James George", email: "james@unpixel.com", avatar: "https://i.pravatar.cc/150?u=james", phone: "08092139441", jobTitle: "Designer", cv: "CV.pdf", stage: "Hiring" },
                { name: "Jordyn George", email: "jordyn@unpixel.com", avatar: "https://i.pravatar.cc/150?u=jordyn", phone: "08092139441", jobTitle: "Designer", cv: "CV.pdf", stage: "Rejected" },
                { name: "Skylar Herwitz", email: "skylar@unpixel.com", avatar: "https://i.pravatar.cc/150?u=skylar", phone: "08092139441", jobTitle: "Designer", cv: "CV.pdf", stage: "Screening" }
            ];
            for (const dc of defaultCandidates) {
                await db_js_1.db.candidate.create({
                    data: {
                        name: dc.name,
                        email: dc.email,
                        avatar: dc.avatar,
                        phone: dc.phone,
                        jobTitle: dc.jobTitle,
                        cv: dc.cv,
                        stage: dc.stage,
                        jobId: someJob ? someJob.id : null,
                        companyId,
                        comments: [
                            { author: "Hiring Manager", time: "Yesterday, 3:45 PM", text: "Impressive portfolio. Definitely schedule a technical screening call." }
                        ],
                        activity: [
                            { author: "System", action: "Applied", time: "Just now", details: "Applied via online portal" }
                        ]
                    }
                });
            }
        }
        const where = { companyId };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { jobTitle: { contains: search, mode: "insensitive" } }
            ];
        }
        if (status && status !== "All Status") {
            where.stage = status;
        }
        const dbCandidates = await db_js_1.db.candidate.findMany({
            where,
            include: {
                job: true
            },
            orderBy: { createdAt: "desc" }
        });
        const candidates = dbCandidates.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            avatar: c.avatar,
            phone: c.phone,
            jobId: c.jobId,
            job: c.job ? c.job.title : c.jobTitle,
            cv: c.cv,
            createdDate: c.createdAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
            stage: c.stage,
            overallRating: c.overallRating,
            evaluationText: c.evaluationText,
            comments: c.comments,
            activity: c.activity
        }));
        return res.json({ candidates });
    }
    catch (error) {
        console.error("GET candidates error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/recruitment/candidates
app.post("/api/recruitment/candidates", async (req, res) => {
    try {
        const { name, email, phone, job, cv, stage, companyId: qCompanyId } = req.body;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        // Try to match job title
        const matchedJob = await db_js_1.db.job.findFirst({
            where: {
                companyId,
                title: { equals: job, mode: "insensitive" }
            }
        });
        const newCandidate = await db_js_1.db.candidate.create({
            data: {
                name,
                email,
                phone: phone || "",
                avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(name)}`,
                jobTitle: job || "General",
                jobId: matchedJob ? matchedJob.id : null,
                cv: cv || "-",
                stage: stage || "Applied",
                companyId
            }
        });
        return res.json({ candidate: newCandidate });
    }
    catch (error) {
        console.error("POST candidate error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /api/recruitment/candidates/:id
app.put("/api/recruitment/candidates/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, jobTitle, cv, stage, overallRating, evaluationText, comments, activity } = req.body;
        const updatedCandidate = await db_js_1.db.candidate.update({
            where: { id },
            data: {
                name,
                email,
                phone,
                jobTitle,
                cv,
                stage,
                overallRating,
                evaluationText,
                comments,
                activity
            }
        });
        return res.json({ candidate: updatedCandidate });
    }
    catch (error) {
        console.error("PUT candidate error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/recruitment/candidates/:id
app.delete("/api/recruitment/candidates/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db_js_1.db.candidate.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("DELETE candidate error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Settings: Stages
app.get("/api/recruitment/settings/stages", async (req, res) => {
    try {
        const { companyId: qCompanyId } = req.query;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        // Seed defaults if empty
        const count = await db_js_1.db.recruitmentStage.count({ where: { companyId } });
        if (count === 0) {
            const defaultStages = [
                { name: "Applied", isLocked: true, position: 0 },
                { name: "Screening", isLocked: false, position: 1 },
                { name: "1st Interview", isLocked: false, position: 2 },
                { name: "2nd Interview", isLocked: false, position: 3 },
                { name: "Offered", isLocked: true, position: 4 },
                { name: "Hired", isLocked: true, position: 5 },
                { name: "Rejected", isLocked: true, position: 6 }
            ];
            for (const ds of defaultStages) {
                await db_js_1.db.recruitmentStage.create({
                    data: { ...ds, companyId }
                });
            }
        }
        const stages = await db_js_1.db.recruitmentStage.findMany({
            where: { companyId },
            orderBy: { position: "asc" }
        });
        return res.json({ stages });
    }
    catch (error) {
        console.error("GET stages error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.post("/api/recruitment/settings/stages", async (req, res) => {
    try {
        const { name, companyId: qCompanyId } = req.body;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        const maxPosStage = await db_js_1.db.recruitmentStage.findFirst({
            where: { companyId },
            orderBy: { position: "desc" }
        });
        const nextPos = maxPosStage ? maxPosStage.position + 1 : 0;
        const newStage = await db_js_1.db.recruitmentStage.create({
            data: {
                name,
                isLocked: false,
                position: nextPos,
                companyId
            }
        });
        return res.json({ stage: newStage });
    }
    catch (error) {
        console.error("POST stage error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.put("/api/recruitment/settings/stages/reorder", async (req, res) => {
    try {
        const { stageIds } = req.body; // Array of IDs in new order
        if (!Array.isArray(stageIds)) {
            return res.status(400).json({ error: "stageIds must be an array" });
        }
        await Promise.all(stageIds.map((id, index) => db_js_1.db.recruitmentStage.update({
            where: { id },
            data: { position: index }
        })));
        return res.json({ success: true });
    }
    catch (error) {
        console.error("Reorder stages error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.put("/api/recruitment/settings/stages/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const updated = await db_js_1.db.recruitmentStage.update({
            where: { id },
            data: { name }
        });
        return res.json({ stage: updated });
    }
    catch (error) {
        console.error("PUT stage error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.delete("/api/recruitment/settings/stages/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db_js_1.db.recruitmentStage.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("DELETE stage error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Settings: Tags
app.get("/api/recruitment/settings/tags", async (req, res) => {
    try {
        const { companyId: qCompanyId } = req.query;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        // Seed defaults if empty
        const count = await db_js_1.db.recruitmentTag.count({ where: { companyId } });
        if (count === 0) {
            const defaultTags = ["Design", "Engineer", "Finance", "Product"];
            for (const t of defaultTags) {
                await db_js_1.db.recruitmentTag.create({
                    data: { name: t, companyId }
                });
            }
        }
        const dbTags = await db_js_1.db.recruitmentTag.findMany({
            where: { companyId },
            orderBy: { createdAt: "asc" }
        });
        const tags = await Promise.all(dbTags.map(async (t) => {
            // Count candidates matching this tag (jobTitle or job department)
            const candidateCount = await db_js_1.db.candidate.count({
                where: {
                    companyId,
                    OR: [
                        { jobTitle: { contains: t.name, mode: "insensitive" } },
                        { job: { department: { contains: t.name, mode: "insensitive" } } }
                    ]
                }
            });
            return {
                id: t.id,
                name: t.name,
                candidateCount
            };
        }));
        return res.json({ tags });
    }
    catch (error) {
        console.error("GET tags error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.post("/api/recruitment/settings/tags", async (req, res) => {
    try {
        const { name, companyId: qCompanyId } = req.body;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        const newTag = await db_js_1.db.recruitmentTag.create({
            data: { name, companyId }
        });
        return res.json({ tag: newTag });
    }
    catch (error) {
        console.error("POST tag error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.put("/api/recruitment/settings/tags/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const updated = await db_js_1.db.recruitmentTag.update({
            where: { id },
            data: { name }
        });
        return res.json({ tag: updated });
    }
    catch (error) {
        console.error("PUT tag error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.delete("/api/recruitment/settings/tags/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db_js_1.db.recruitmentTag.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("DELETE tag error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Settings: Resources
app.get("/api/recruitment/settings/resources", async (req, res) => {
    try {
        const { companyId: qCompanyId } = req.query;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        const count = await db_js_1.db.recruitmentResource.count({ where: { companyId } });
        if (count === 0) {
            const defaultResources = ["Interview Evaluation Sheet", "Candidate Assessment Checklist"];
            for (const r of defaultResources) {
                await db_js_1.db.recruitmentResource.create({
                    data: { name: r, companyId }
                });
            }
        }
        const dbResources = await db_js_1.db.recruitmentResource.findMany({
            where: { companyId },
            orderBy: { updatedAt: "desc" }
        });
        const resources = dbResources.map((r) => {
            // Find time elapsed
            const diffMs = Date.now() - r.updatedAt.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            let updatedAtStr = "Updated just now";
            if (diffDays > 0) {
                updatedAtStr = `Updated ${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
            }
            return {
                id: r.id,
                name: r.name,
                updatedAt: updatedAtStr
            };
        });
        return res.json({ resources });
    }
    catch (error) {
        console.error("GET resources error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.post("/api/recruitment/settings/resources", async (req, res) => {
    try {
        const { name, companyId: qCompanyId } = req.body;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        const newResource = await db_js_1.db.recruitmentResource.create({
            data: { name, companyId }
        });
        return res.json({ resource: newResource });
    }
    catch (error) {
        console.error("POST resource error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.put("/api/recruitment/settings/resources/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const updated = await db_js_1.db.recruitmentResource.update({
            where: { id },
            data: { name }
        });
        return res.json({ resource: updated });
    }
    catch (error) {
        console.error("PUT resource error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.delete("/api/recruitment/settings/resources/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db_js_1.db.recruitmentResource.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("DELETE resource error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Settings: Email Templates
app.get("/api/recruitment/settings/templates", async (req, res) => {
    try {
        const { companyId: qCompanyId } = req.query;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        const count = await db_js_1.db.recruitmentEmailTemplate.count({ where: { companyId } });
        if (count === 0) {
            const defaultTemplates = [
                {
                    name: "Offer",
                    subject: "Offer from {{company_name}}",
                    body: "Dear {{candidate_first_name}},\n\n{{company_name}} is excited to bring you on board as {{job_title}}.\n\nYou were our best candidates. We were really sold on your [details about the candidate that made them your choice].\n\n{{company_name}} is offering a [full time, part time, etc.] position for you as {{job_title}}, reporting to [immediate manager/supervisor] starting on [proposed start date] at [workplace location]\n\nBest regards,\n\n{{company_name}}",
                    stage: "Offered",
                    isLocked: true
                },
                {
                    name: "Auto Confirmation",
                    subject: "Thank you for your application at {{company_name}}",
                    body: "Hi {{candidate_name}},\n\nThank you for applying to the {{job_title}} position at {{company_name}}...\n\nBest regards,\nHR Team",
                    stage: "Applied",
                    isLocked: true
                },
                {
                    name: "Rejection",
                    subject: "{{job_title}} position at {{company_name}}",
                    body: "Hi {{candidate_name}},\n\nThank you for your interest in the {{job_title}} position at {{company_name}}...\n\nBest regards,\nHR Team",
                    stage: "Rejected",
                    isLocked: true
                }
            ];
            for (const t of defaultTemplates) {
                await db_js_1.db.recruitmentEmailTemplate.create({
                    data: { ...t, companyId }
                });
            }
        }
        const dbTemplates = await db_js_1.db.recruitmentEmailTemplate.findMany({
            where: { companyId },
            orderBy: { createdAt: "asc" }
        });
        const templates = dbTemplates.map((t) => ({
            id: t.id,
            name: t.name,
            subject: t.subject,
            body: t.body,
            stage: t.stage,
            lastModified: t.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
            isLocked: t.isLocked
        }));
        return res.json({ templates });
    }
    catch (error) {
        console.error("GET templates error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.post("/api/recruitment/settings/templates", async (req, res) => {
    try {
        const { name, subject, body, stage, companyId: qCompanyId } = req.body;
        const companyId = await getRecruitmentCompanyId(qCompanyId);
        const newTemplate = await db_js_1.db.recruitmentEmailTemplate.create({
            data: {
                name,
                subject,
                body,
                stage,
                isLocked: false,
                companyId
            }
        });
        return res.json({ template: newTemplate });
    }
    catch (error) {
        console.error("POST template error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
app.put("/api/recruitment/settings/templates/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, subject, body, stage } = req.body;
        const updated = await db_js_1.db.recruitmentEmailTemplate.update({
            where: { id },
            data: { name, subject, body, stage }
        });
        return res.json({ template: updated });
    }
    catch (error) {
        console.error("PUT template error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /api/recruitment/settings/templates/:id
app.delete("/api/recruitment/settings/templates/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db_js_1.db.recruitmentEmailTemplate.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("DELETE template error:", error);
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
