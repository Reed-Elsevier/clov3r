import type { WorkflowInsights } from "@/lib/types/dashboard";

// Illustrative values only — shaped like GET /api/workflow-insights output (PLAN-08).
export const mockWorkflow: WorkflowInsights = {
  meta: { source: "mock", generatedAt: "2026-10-08T00:00:00.000Z" },
  byDepartment: [
    { departmentId: "DEP010", departmentName: "Information Technology", invoices: 5018, exceptions: 1124, exceptionRate: 22.4 },
    { departmentId: "DEP004", departmentName: "Operations", invoices: 5162, exceptions: 986, exceptionRate: 19.1 },
    { departmentId: "DEP007", departmentName: "Marketing", invoices: 4216, exceptions: 742, exceptionRate: 17.6 },
    { departmentId: "DEP012", departmentName: "Facilities", invoices: 4020, exceptions: 611, exceptionRate: 15.2 },
    { departmentId: "DEP015", departmentName: "Human Resources", invoices: 3148, exceptions: 403, exceptionRate: 12.8 },
    { departmentId: "DEP001", departmentName: "Finance", invoices: 3248, exceptions: 341, exceptionRate: 10.5 },
  ],
  bySupplier: [
    { supplierId: "SUP000103", supplierName: "Bluepeak IT Services", category: "IT Services", riskTier: "High", invoices: 812, exceptions: 268, exceptionRate: 33.0, topExceptionType: "Price mismatch" },
    { supplierId: "SUP000211", supplierName: "Crescent Events Group", category: "Events Services", riskTier: "Medium", invoices: 604, exceptions: 171, exceptionRate: 28.3, topExceptionType: "Duplicate suspected" },
    { supplierId: "SUP000047", supplierName: "Apex Data Providers", category: "Data Providers", riskTier: "Medium", invoices: 1290, exceptions: 322, exceptionRate: 25.0, topExceptionType: "Missing PO" },
    { supplierId: "SUP000264", supplierName: "Harbor Facilities Co.", category: "Facilities", riskTier: "Low", invoices: 958, exceptions: 214, exceptionRate: 22.3, topExceptionType: "Quantity mismatch" },
    { supplierId: "SUP000319", supplierName: "Summit Consulting", category: "Professional Services", riskTier: "High", invoices: 377, exceptions: 79, exceptionRate: 21.0, topExceptionType: "Missing goods receipt" },
    { supplierId: "SUP000012", supplierName: "Northwind Software", category: "Software", riskTier: "Low", invoices: 1544, exceptions: 247, exceptionRate: 16.0, topExceptionType: "Tax error" },
  ],
  reviewTimeByType: [
    { exceptionType: "Bank details changed", count: 96, medianHours: 52, p90Hours: 140, totalHours: 6120 },
    { exceptionType: "Price mismatch", count: 921, medianHours: 30, p90Hours: 96, totalHours: 33150 },
    { exceptionType: "Missing goods receipt", count: 455, medianHours: 27, p90Hours: 88, totalHours: 14010 },
    { exceptionType: "Quantity mismatch", count: 688, medianHours: 22, p90Hours: 70, totalHours: 17880 },
    { exceptionType: "Duplicate suspected", count: 402, medianHours: 18, p90Hours: 61, totalHours: 8840 },
    { exceptionType: "Missing PO", count: 1340, medianHours: 14, p90Hours: 46, totalHours: 21440 },
    { exceptionType: "Tax error", count: 318, medianHours: 9, p90Hours: 30, totalHours: 3500 },
  ],
  delayTrend: [
    { month: "2025-10", avgDaysVsDue: 1.8, openExceptions: 118, resolvedExceptions: 300 },
    { month: "2025-11", avgDaysVsDue: 2.3, openExceptions: 126, resolvedExceptions: 269 },
    { month: "2025-12", avgDaysVsDue: 4.1, openExceptions: 171, resolvedExceptions: 300 },
    { month: "2026-01", avgDaysVsDue: 3.2, openExceptions: 104, resolvedExceptions: 258 },
    { month: "2026-02", avgDaysVsDue: 2.0, openExceptions: 92, resolvedExceptions: 292 },
    { month: "2026-03", avgDaysVsDue: 1.4, openExceptions: 88, resolvedExceptions: 324 },
    { month: "2026-04", avgDaysVsDue: 0.9, openExceptions: 81, resolvedExceptions: 321 },
    { month: "2026-05", avgDaysVsDue: 1.1, openExceptions: 77, resolvedExceptions: 311 },
    { month: "2026-06", avgDaysVsDue: 0.4, openExceptions: 69, resolvedExceptions: 302 },
    { month: "2026-07", avgDaysVsDue: -0.3, openExceptions: 64, resolvedExceptions: 301 },
    { month: "2026-08", avgDaysVsDue: -0.8, openExceptions: 58, resolvedExceptions: 291 },
    { month: "2026-09", avgDaysVsDue: -1.2, openExceptions: 55, resolvedExceptions: 283 },
  ],
};
