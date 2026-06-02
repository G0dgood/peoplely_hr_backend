"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
const EMPLOYEES = [
    {
        name: "Pristia Candra",
        email: "pristia@unpixel.com",
        avatar: "https://i.pravatar.cc/150?u=pristia",
        role: "UI UX Designer",
        manager: "@Pristiacandra",
        department: "Team Product",
        office: "Unpixel Office",
        status: "ACTIVE",
        account: "Activated",
    },
    {
        name: "Hanna Baptista",
        email: "hanna@unpixel.com",
        avatar: "https://i.pravatar.cc/150?u=hanna",
        role: "Graphic Designer",
        manager: "@Pristiacandra",
        department: "Team Product",
        office: "Unpixel Office",
        status: "ON BOARDING",
        account: "Activated",
    },
    {
        name: "Miracle Geidt",
        email: "miracle@unpixel.com",
        avatar: "https://i.pravatar.cc/150?u=miracle",
        role: "Finance",
        manager: "@Pristiacandra",
        department: "Team Product",
        office: "Unpixel Office",
        status: "PROBATION",
        account: "Need Invitation",
    },
    {
        name: "Rayna Torff",
        email: "rayna@unpixel.com",
        avatar: "https://i.pravatar.cc/150?u=rayna",
        role: "Project Manager",
        manager: "@Pristiacandra",
        department: "Team Product",
        office: "Unpixel Office",
        status: "ACTIVE",
        account: "Activated",
    },
    {
        name: "Giana Lipshutz",
        email: "giana@unpixel.com",
        avatar: "https://i.pravatar.cc/150?u=giana",
        role: "Creative Director",
        manager: "@Pristiacandra",
        department: "Team Product",
        office: "Unpixel Office",
        status: "ON LEAVE",
        account: "Need Invitation",
    },
    {
        name: "James George",
        email: "james@unpixel.com",
        avatar: "https://i.pravatar.cc/150?u=james",
        role: "Lead Designer",
        manager: "@Pristiacandra",
        department: "Team Product",
        office: "Unpixel Office",
        status: "ACTIVE",
        account: "Activated",
    },
    {
        name: "Jordyn George",
        email: "jordyn@unpixel.com",
        avatar: "https://i.pravatar.cc/150?u=jordyn",
        role: "IT Support",
        manager: "@Pristiacandra",
        department: "Team Product",
        office: "Unpixel Office",
        status: "ON BOARDING",
        account: "Activated",
    },
    {
        name: "Skylar Herwitz",
        email: "skylar@unpixel.com",
        avatar: "https://i.pravatar.cc/150?u=skylar",
        role: "3D Designer",
        manager: "@Pristiacandra",
        department: "Team Product",
        office: "Unpixel Office",
        status: "ACTIVE",
        account: "Activated",
    },
];
async function main() {
    console.log("Starting seeding...");
    // Seed default admin/user
    const existingUser = await prisma.user.findUnique({
        where: { email: "pristia@gmail.com" },
    });
    if (!existingUser) {
        const hashedPassword = await bcryptjs_1.default.hash("password123", 10);
        await prisma.user.create({
            data: {
                email: "pristia@gmail.com",
                password: hashedPassword,
                name: "Pristia Candra",
            },
        });
        console.log("Seeded user: pristia@gmail.com / password123");
    }
    else {
        console.log("User pristia@gmail.com already exists");
    }
    // Seed employees
    for (const emp of EMPLOYEES) {
        const existingEmp = await prisma.employee.findUnique({
            where: { email: emp.email },
        });
        if (!existingEmp) {
            await prisma.employee.create({
                data: emp,
            });
            console.log(`Seeded employee: ${emp.name} (${emp.email})`);
        }
        else {
            console.log(`Employee with email ${emp.email} already exists`);
        }
    }
    console.log("Seeding finished successfully.");
}
main()
    .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
