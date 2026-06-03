"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
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
    // Seed default job titles
    const defaultJobTitles = [
        { title: "UI UX Designer", active: true },
        { title: "Graphic Designer", active: true },
        { title: "Product Manager", active: true },
        { title: "CEO", active: true },
        { title: "CTO", active: true },
        { title: "CFO", active: true },
        { title: "CPO", active: true },
        { title: "Project Manager", active: true },
    ];
    for (const job of defaultJobTitles) {
        const existing = await prisma.jobTitle.findFirst({
            where: {
                title: job.title,
                companyId: null,
            }
        });
        if (!existing) {
            await prisma.jobTitle.create({
                data: {
                    title: job.title,
                    active: job.active,
                    companyId: null,
                }
            });
            console.log(`Seeded job title: ${job.title}`);
        }
        else {
            console.log(`Job title already exists: ${job.title}`);
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
