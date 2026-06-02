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
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
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
            },
        });
    }
    catch (error) {
        console.error("Login API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// Employee Routes
// GET /api/employees (list with filters and search)
app.get("/api/employees", async (req, res) => {
    try {
        const search = req.query.search || "";
        const office = req.query.office || "";
        const role = req.query.role || "";
        const status = req.query.status || "";
        const where = {};
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
        const employees = await db_js_1.db.employee.findMany({
            where,
            orderBy: { createdAt: "desc" },
        });
        return res.json({ employees });
    }
    catch (error) {
        console.error("GET employees API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
// POST /api/employees (create new employee)
app.post("/api/employees", async (req, res) => {
    try {
        const { name, email, role, manager, department, office, status, account, avatar } = req.body;
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
                manager: manager || "@manager",
                department,
                office,
                status: status || "ACTIVE",
                account: account || "Need Invitation",
                avatar: avatar || `https://i.pravatar.cc/150?u=${encodeURIComponent(email)}`,
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
        const { name, email, role, manager, department, office, status, account, avatar } = req.body;
        const existingEmp = await db_js_1.db.employee.findUnique({
            where: { id },
        });
        if (!existingEmp) {
            return res.status(404).json({ error: "Employee not found" });
        }
        // If email is being changed, ensure it's not taken
        if (email && email.toLowerCase().trim() !== existingEmp.email.toLowerCase().trim()) {
            const emailTaken = await db_js_1.db.employee.findUnique({
                where: { email: email.toLowerCase().trim() },
            });
            if (emailTaken) {
                return res.status(400).json({ error: "Email is already in use by another employee" });
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
        return res.json({ success: true, message: "Employee deleted successfully" });
    }
    catch (error) {
        console.error("DELETE employee API error:", error);
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
