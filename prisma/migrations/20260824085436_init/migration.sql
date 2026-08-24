-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'OPS_MANAGER', 'CLEANER', 'CLIENT');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('EN', 'AR');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CHURNED');

-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('PER_JOB', 'MONTHLY_CONSOLIDATED');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'VILLA', 'OFFICE', 'RETAIL', 'WAREHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('CORE', 'ADDON');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FLAT', 'PER_ROOM', 'PER_SQM', 'PER_HOUR', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('ONE_OFF', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('GOOGLE', 'INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'REFERRAL', 'WALK_IN', 'REPEAT', 'PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "LostReason" AS ENUM ('PRICE_TOO_HIGH', 'NO_AVAILABILITY', 'WENT_WITH_COMPETITOR', 'NO_RESPONSE', 'OUT_OF_SERVICE_AREA', 'NOT_SERIOUS', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'SITE_VISIT', 'STATUS_CHANGE', 'QUOTE_SENT');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_ACCESS');

-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PASSPORT', 'VISA', 'EMIRATES_ID', 'MEDICAL_FITNESS', 'LABOUR_CARD', 'CONTRACT', 'TRAINING_CERT', 'OTHER');

-- CreateEnum
CREATE TYPE "StaffPosition" AS ENUM ('CLEANER', 'TEAM_LEAD', 'SUPERVISOR', 'DRIVER', 'OFFICE');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY', 'MATERNITY', 'HAJJ');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('BEFORE', 'AFTER', 'ISSUE');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('DAMAGE', 'NO_ACCESS', 'ON_SITE_COMPLAINT', 'CLIENT_COMPLAINT', 'LOW_RATING', 'EQUIPMENT_FAULT', 'OTHER');

-- CreateEnum
CREATE TYPE "TicketSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_CLIENT', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TimeReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('MOBILE', 'MANUAL');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('STANDARD', 'CONSOLIDATED', 'PACKAGE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD_STRIPE', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'PACKAGE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CreditNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'APPLIED', 'VOID');

-- CreateEnum
CREATE TYPE "ClientPackageStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'USED_UP', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DunningStatus" AS ENUM ('SCHEDULED', 'SENT', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'WHATSAPP', 'BOTH');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('WINBACK', 'NPS', 'PROMO', 'REFERRAL_PUSH');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "RiskReason" AS ENUM ('SKIPPED_CYCLES', 'RATING_DECLINE', 'PAYMENT_FRICTION', 'INACTIVITY', 'COMPLAINT_HISTORY');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('PIECE', 'LITRE', 'KILOGRAM', 'BOX', 'ROLL');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'ISSUE_TO_TEAM', 'RETURN', 'ADJUSTMENT', 'WASTAGE');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('IN_SERVICE', 'IN_REPAIR', 'RETIRED', 'LOST');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('SCHEDULED', 'REPAIR', 'INSPECTION');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'LOGIN', 'EXPORT', 'APPROVE', 'REJECT', 'SEND', 'PAYMENT_RECORDED', 'REFUND');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "legalName" TEXT,
    "trn" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "defaultLocale" "Locale" NOT NULL DEFAULT 'EN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "vatRateBps" INTEGER NOT NULL DEFAULT 500,
    "weekendDays" INTEGER[] DEFAULT ARRAY[5, 6]::INTEGER[],
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT DEFAULT 'Dubai',
    "emirate" TEXT DEFAULT 'Dubai',
    "poBox" TEXT,
    "phone" TEXT,
    "whatsappNumber" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "quotePrefix" TEXT NOT NULL DEFAULT 'QT',
    "creditNotePrefix" TEXT NOT NULL DEFAULT 'CN',
    "invoiceFooterEn" TEXT,
    "invoiceFooterAr" TEXT,
    "quoteValidityDays" INTEGER NOT NULL DEFAULT 14,
    "bankName" TEXT,
    "bankIban" TEXT,
    "bankAccountName" TEXT,
    "rescheduleCutoffHours" INTEGER NOT NULL DEFAULT 24,
    "lateCancellationFeeBps" INTEGER NOT NULL DEFAULT 0,
    "lateCancellationFeeFlatFils" INTEGER NOT NULL DEFAULT 0,
    "defaultTravelBufferMinutes" INTEGER NOT NULL DEFAULT 30,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 200,
    "ratingRequestDelayMinutes" INTEGER NOT NULL DEFAULT 120,
    "reCleanRatingThreshold" INTEGER NOT NULL DEFAULT 4,
    "googleReviewUrl" TEXT,
    "npsIntervalDays" INTEGER NOT NULL DEFAULT 90,
    "winbackInactiveDays" INTEGER NOT NULL DEFAULT 60,
    "churnSkippedCycles" INTEGER NOT NULL DEFAULT 2,
    "referralDiscountType" "DiscountType" NOT NULL DEFAULT 'FIXED',
    "referrerRewardValue" INTEGER NOT NULL DEFAULT 0,
    "refereeRewardValue" INTEGER NOT NULL DEFAULT 0,
    "dunningOffsetsDays" INTEGER[] DEFAULT ARRAY[0, 3, 7]::INTEGER[],
    "autoPauseOverdueClients" BOOLEAN NOT NULL DEFAULT false,
    "autoPauseAfterDays" INTEGER NOT NULL DEFAULT 14,
    "complianceAlertDays" INTEGER[] DEFAULT ARRAY[60, 30, 7]::INTEGER[],
    "complianceAlertEmail" TEXT,
    "lowStockAlertEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorEmail" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "emirate" TEXT NOT NULL DEFAULT 'Dubai',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_travel_times" (
    "id" UUID NOT NULL,
    "fromZoneId" UUID NOT NULL,
    "toZoneId" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,

    CONSTRAINT "zone_travel_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "category" "ServiceCategory" NOT NULL DEFAULT 'CORE',
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 120,
    "defaultCleaners" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_card_items" (
    "id" UUID NOT NULL,
    "rateCardId" UUID NOT NULL,
    "serviceTypeId" UUID NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'PER_ROOM',
    "basePriceFils" INTEGER NOT NULL DEFAULT 0,
    "perBedroomFils" INTEGER NOT NULL DEFAULT 0,
    "perBathroomFils" INTEGER NOT NULL DEFAULT 0,
    "perSqmFils" INTEGER NOT NULL DEFAULT 0,
    "perHourFils" INTEGER NOT NULL DEFAULT 0,
    "perUnitFils" INTEGER NOT NULL DEFAULT 0,
    "minimumChargeFils" INTEGER NOT NULL DEFAULT 0,
    "minutesBase" INTEGER NOT NULL DEFAULT 0,
    "minutesPerBedroom" INTEGER NOT NULL DEFAULT 0,
    "minutesPerBathroom" INTEGER NOT NULL DEFAULT 0,
    "minutesPer100Sqm" INTEGER NOT NULL DEFAULT 0,
    "minutesPerUnit" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_card_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "frequency_modifiers" (
    "id" UUID NOT NULL,
    "rateCardId" UUID NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "discountBps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "frequency_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "source" "LeadSource" NOT NULL,
    "sourceDetail" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referralCodeUsed" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "lostReason" "LostReason",
    "lostNote" TEXT,
    "boardPosition" INTEGER NOT NULL DEFAULT 0,
    "propertyType" "PropertyType",
    "zoneId" UUID,
    "addressLine" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "sqm" INTEGER,
    "serviceTypeId" UUID,
    "frequency" "Frequency",
    "preferredDate" TIMESTAMP(3),
    "notes" TEXT,
    "estimateFils" INTEGER,
    "ownerId" UUID,
    "firstContactedAt" TIMESTAMP(3),
    "convertedClientId" UUID,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "quoteNo" TEXT NOT NULL,
    "leadId" UUID,
    "clientId" UUID,
    "rateCardId" UUID,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3) NOT NULL,
    "frequency" "Frequency" NOT NULL DEFAULT 'ONE_OFF',
    "subtotalFils" INTEGER NOT NULL DEFAULT 0,
    "discountFils" INTEGER NOT NULL DEFAULT 0,
    "vatRateBps" INTEGER NOT NULL DEFAULT 500,
    "vatFils" INTEGER NOT NULL DEFAULT 0,
    "totalFils" INTEGER NOT NULL DEFAULT 0,
    "notesEn" TEXT,
    "notesAr" TEXT,
    "pdfUrl" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "serviceTypeId" UUID,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPriceFils" INTEGER NOT NULL,
    "discountFils" INTEGER NOT NULL DEFAULT 0,
    "lineTotalFils" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "clientNo" TEXT NOT NULL,
    "userId" UUID,
    "type" "ClientType" NOT NULL DEFAULT 'RESIDENTIAL',
    "companyName" TEXT,
    "contactName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "whatsappPhone" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "trn" TEXT,
    "billingMode" "BillingMode" NOT NULL DEFAULT 'PER_JOB',
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "referralCode" TEXT NOT NULL,
    "referredByClientId" UUID,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "isBookingPaused" BOOLEAN NOT NULL DEFAULT false,
    "bookingPauseReason" TEXT,
    "creditBalanceFils" INTEGER NOT NULL DEFAULT 0,
    "leadSource" "LeadSource",
    "acquiredAt" TIMESTAMP(3),
    "lastJobAt" TIMESTAMP(3),
    "notesEn" TEXT,
    "vipNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_properties" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "zoneId" UUID,
    "buildingName" TEXT,
    "unitNumber" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL DEFAULT 'Dubai',
    "emirate" TEXT NOT NULL DEFAULT 'Dubai',
    "makaniNumber" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "sqm" INTEGER,
    "accessNotes" TEXT,
    "gateCode" TEXT,
    "parkingNotes" TEXT,
    "hasPets" BOOLEAN NOT NULL DEFAULT false,
    "petNotes" TEXT,
    "chemicalAllergies" TEXT,
    "keyHeldByCompany" BOOLEAN NOT NULL DEFAULT false,
    "keyTag" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "client_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "referrerClientId" UUID NOT NULL,
    "refereeClientId" UUID,
    "refereeLeadId" UUID,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "referrerRewardFils" INTEGER NOT NULL DEFAULT 0,
    "refereeDiscountFils" INTEGER NOT NULL DEFAULT 0,
    "qualifyingJobId" UUID,
    "referrerRewardedAt" TIMESTAMP(3),
    "refereeDiscountedAt" TIMESTAMP(3),
    "attributedRevenueFils" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_spend" (
    "id" UUID NOT NULL,
    "source" "LeadSource" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amountFils" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "marketing_spend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "userId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "nationality" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "photoUrl" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "position" "StaffPosition" NOT NULL DEFAULT 'CLEANER',
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hiredAt" TIMESTAMP(3) NOT NULL,
    "terminatedAt" TIMESTAMP(3),
    "basicSalaryFils" INTEGER NOT NULL DEFAULT 0,
    "allowancesFils" INTEGER NOT NULL DEFAULT 0,
    "iban" TEXT,
    "wpsLabourCardNo" TEXT,
    "annualLeaveDays" INTEGER NOT NULL DEFAULT 30,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_documents" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "number" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "fileUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "staff_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_alerts" (
    "id" UUID NOT NULL,
    "staffDocumentId" UUID NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipient" TEXT NOT NULL,

    CONSTRAINT "compliance_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "colorHex" TEXT NOT NULL DEFAULT '#2563EB',
    "homeZoneId" UUID,
    "capacityMinutesPerDay" INTEGER NOT NULL DEFAULT 480,
    "workingDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4]::INTEGER[],
    "shiftStart" TEXT NOT NULL DEFAULT '08:00',
    "shiftEnd" TEXT NOT NULL DEFAULT '18:00',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_series" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "serviceTypeId" UUID NOT NULL,
    "teamId" UUID,
    "frequency" "Frequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "occurrenceLimit" INTEGER,
    "timeOfDay" TEXT NOT NULL DEFAULT '09:00',
    "durationMinutes" INTEGER NOT NULL,
    "cleanersRequired" INTEGER NOT NULL DEFAULT 2,
    "priceFils" INTEGER NOT NULL,
    "status" "SeriesStatus" NOT NULL DEFAULT 'ACTIVE',
    "generatedUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "recurring_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "jobNo" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "propertyId" UUID NOT NULL,
    "serviceTypeId" UUID NOT NULL,
    "teamId" UUID,
    "seriesId" UUID,
    "occurrenceIndex" INTEGER,
    "status" "JobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL,
    "cleanersRequired" INTEGER NOT NULL DEFAULT 2,
    "subtotalFils" INTEGER NOT NULL DEFAULT 0,
    "discountFils" INTEGER NOT NULL DEFAULT 0,
    "vatRateBps" INTEGER NOT NULL DEFAULT 500,
    "vatFils" INTEGER NOT NULL DEFAULT 0,
    "totalFils" INTEGER NOT NULL DEFAULT 0,
    "clientNotes" TEXT,
    "internalNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancellationReason" TEXT,
    "isLateCancellation" BOOLEAN NOT NULL DEFAULT false,
    "lateCancellationFeeFils" INTEGER NOT NULL DEFAULT 0,
    "noAccessNote" TEXT,
    "rescheduledFromId" UUID,
    "invoiceId" UUID,
    "checklistTemplateId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_lines" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "serviceTypeId" UUID,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPriceFils" INTEGER NOT NULL,
    "discountFils" INTEGER NOT NULL DEFAULT 0,
    "lineTotalFils" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "job_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_assignments" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "serviceTypeId" UUID,
    "propertyType" "PropertyType",
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_items" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "section" TEXT,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_checklist_items" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "templateItemId" UUID,
    "section" TEXT,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "checkedByStaffId" UUID,
    "note" TEXT,

    CONSTRAINT "job_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_photos" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "kind" "PhotoKind" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "thumbnailPath" TEXT,
    "caption" TEXT,
    "roomLabel" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "takenByStaffId" UUID,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isVisibleToClient" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "job_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "jobId" UUID,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockInLat" DOUBLE PRECISION,
    "clockInLng" DOUBLE PRECISION,
    "clockInAccuracyM" INTEGER,
    "clockInDistanceM" INTEGER,
    "clockInFlagged" BOOLEAN NOT NULL DEFAULT false,
    "clockOutAt" TIMESTAMP(3),
    "clockOutLat" DOUBLE PRECISION,
    "clockOutLng" DOUBLE PRECISION,
    "clockOutAccuracyM" INTEGER,
    "clockOutDistanceM" INTEGER,
    "clockOutFlagged" BOOLEAN NOT NULL DEFAULT false,
    "minutesWorked" INTEGER,
    "source" "TimeEntrySource" NOT NULL DEFAULT 'MOBILE',
    "reviewStatus" "TimeReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "severity" "TicketSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "jobId" UUID,
    "clientId" UUID,
    "raisedByStaffId" UUID,
    "raisedByUserId" UUID,
    "assignedToUserId" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "ratingId" UUID,
    "reCleanOffered" BOOLEAN NOT NULL DEFAULT false,
    "reCleanApprovedById" UUID,
    "reCleanApprovedAt" TIMESTAMP(3),
    "reCleanJobId" UUID,
    "compensationFils" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_comments" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "userId" UUID,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "storagePath" TEXT NOT NULL,
    "caption" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "id" UUID NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'STANDARD',
    "clientId" UUID NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "periodStart" DATE,
    "periodEnd" DATE,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "vatRateBps" INTEGER NOT NULL DEFAULT 500,
    "subtotalFils" INTEGER NOT NULL DEFAULT 0,
    "discountFils" INTEGER NOT NULL DEFAULT 0,
    "vatFils" INTEGER NOT NULL DEFAULT 0,
    "totalFils" INTEGER NOT NULL DEFAULT 0,
    "amountPaidFils" INTEGER NOT NULL DEFAULT 0,
    "balanceFils" INTEGER NOT NULL DEFAULT 0,
    "supplierName" TEXT,
    "supplierTrn" TEXT,
    "supplierAddress" TEXT,
    "buyerName" TEXT,
    "buyerTrn" TEXT,
    "buyerAddress" TEXT,
    "notesEn" TEXT,
    "notesAr" TEXT,
    "pdfUrl" TEXT,
    "stripePaymentLinkUrl" TEXT,
    "stripePaymentIntentId" TEXT,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "jobId" UUID,
    "serviceTypeId" UUID,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPriceFils" INTEGER NOT NULL,
    "discountFils" INTEGER NOT NULL DEFAULT 0,
    "vatRateBps" INTEGER NOT NULL DEFAULT 500,
    "vatFils" INTEGER NOT NULL DEFAULT 0,
    "lineTotalFils" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "invoiceId" UUID,
    "clientId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'SUCCEEDED',
    "amountFils" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "stripeFeeFils" INTEGER,
    "recordedById" UUID,
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" UUID,
    "notes" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL,
    "creditNoteNo" TEXT NOT NULL,
    "invoiceId" UUID,
    "clientId" UUID NOT NULL,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "subtotalFils" INTEGER NOT NULL DEFAULT 0,
    "vatRateBps" INTEGER NOT NULL DEFAULT 500,
    "vatFils" INTEGER NOT NULL DEFAULT 0,
    "totalFils" INTEGER NOT NULL DEFAULT 0,
    "refundedAmountFils" INTEGER NOT NULL DEFAULT 0,
    "refundMethod" "PaymentMethod",
    "refundedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" UUID NOT NULL,
    "creditNoteId" UUID NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitPriceFils" INTEGER NOT NULL,
    "vatRateBps" INTEGER NOT NULL DEFAULT 500,
    "vatFils" INTEGER NOT NULL DEFAULT 0,
    "lineTotalFils" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "serviceTypeId" UUID,
    "sessions" INTEGER NOT NULL,
    "priceFils" INTEGER NOT NULL,
    "listPriceFils" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL DEFAULT 365,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_packages" (
    "id" UUID NOT NULL,
    "packageNo" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "invoiceId" UUID,
    "sessionsTotal" INTEGER NOT NULL,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 0,
    "pricePaidFils" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "status" "ClientPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_usages" (
    "id" UUID NOT NULL,
    "clientPackageId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sessionsUsed" INTEGER NOT NULL DEFAULT 1,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,

    CONSTRAINT "package_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunning_events" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "step" INTEGER NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'BOTH',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "DunningStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sentAt" TIMESTAMP(3),
    "messageLogId" UUID,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dunning_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "punctualityStars" INTEGER,
    "qualityStars" INTEGER,
    "comment" TEXT,
    "token" TEXT NOT NULL,
    "requestSentAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "googleReviewShownAt" TIMESTAMP(3),
    "googleReviewClickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nps_responses" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "quarter" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nps_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_risk_flags" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "reason" "RiskReason" NOT NULL,
    "detail" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "suggestedAction" TEXT NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "resolutionNote" TEXT,

    CONSTRAINT "client_risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "type" "CampaignType" NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'BOTH',
    "templateId" UUID,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "convertedJobId" UUID,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'BOTH',
    "subjectEn" TEXT,
    "subjectAr" TEXT,
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "templateId" UUID,
    "clientId" UUID,
    "toEmail" TEXT,
    "toPhone" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "relatedEntity" TEXT,
    "relatedId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "category" TEXT,
    "unit" "UnitOfMeasure" NOT NULL DEFAULT 'PIECE',
    "currentQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unitCostFils" INTEGER NOT NULL DEFAULT 0,
    "supplier" TEXT,
    "storageLocation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lowStockAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCostFils" INTEGER NOT NULL DEFAULT 0,
    "teamId" UUID,
    "jobId" UUID,
    "staffId" UUID,
    "reference" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_consumables" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "costFils" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_consumables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" UUID NOT NULL,
    "assetTag" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "category" TEXT,
    "serialNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "purchaseCostFils" INTEGER NOT NULL DEFAULT 0,
    "warrantyExpiresAt" TIMESTAMP(3),
    "assignedTeamId" UUID,
    "assignedStaffId" UUID,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_SERVICE',
    "maintenanceIntervalDays" INTEGER,
    "lastMaintenanceAt" TIMESTAMP(3),
    "nextMaintenanceDueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_maintenance" (
    "id" UUID NOT NULL,
    "equipmentId" UUID NOT NULL,
    "type" "MaintenanceType" NOT NULL DEFAULT 'SCHEDULED',
    "performedAt" TIMESTAMP(3) NOT NULL,
    "costFils" INTEGER NOT NULL DEFAULT 0,
    "vendor" TEXT,
    "notes" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "zones_nameEn_emirate_key" ON "zones"("nameEn", "emirate");

-- CreateIndex
CREATE UNIQUE INDEX "zone_travel_times_fromZoneId_toZoneId_key" ON "zone_travel_times"("fromZoneId", "toZoneId");

-- CreateIndex
CREATE UNIQUE INDEX "service_types_code_key" ON "service_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rate_card_items_rateCardId_serviceTypeId_propertyType_key" ON "rate_card_items"("rateCardId", "serviceTypeId", "propertyType");

-- CreateIndex
CREATE UNIQUE INDEX "frequency_modifiers_rateCardId_frequency_key" ON "frequency_modifiers"("rateCardId", "frequency");

-- CreateIndex
CREATE UNIQUE INDEX "leads_referenceNo_key" ON "leads"("referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "leads_convertedClientId_key" ON "leads"("convertedClientId");

-- CreateIndex
CREATE INDEX "leads_status_boardPosition_idx" ON "leads"("status", "boardPosition");

-- CreateIndex
CREATE INDEX "leads_source_idx" ON "leads"("source");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE INDEX "lead_activities_leadId_createdAt_idx" ON "lead_activities"("leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quoteNo_key" ON "quotes"("quoteNo");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "clients_clientNo_key" ON "clients"("clientNo");

-- CreateIndex
CREATE UNIQUE INDEX "clients_userId_key" ON "clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_referralCode_key" ON "clients"("referralCode");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "clients_deletedAt_idx" ON "clients"("deletedAt");

-- CreateIndex
CREATE INDEX "client_properties_clientId_idx" ON "client_properties"("clientId");

-- CreateIndex
CREATE INDEX "client_properties_zoneId_idx" ON "client_properties"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_refereeClientId_key" ON "referrals"("refereeClientId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_refereeLeadId_key" ON "referrals"("refereeLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_qualifyingJobId_key" ON "referrals"("qualifyingJobId");

-- CreateIndex
CREATE INDEX "referrals_referrerClientId_idx" ON "referrals"("referrerClientId");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_spend_source_year_month_key" ON "marketing_spend"("source", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "staff_employeeNo_key" ON "staff"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "staff_userId_key" ON "staff"("userId");

-- CreateIndex
CREATE INDEX "staff_employmentStatus_idx" ON "staff"("employmentStatus");

-- CreateIndex
CREATE INDEX "staff_documents_expiresAt_idx" ON "staff_documents"("expiresAt");

-- CreateIndex
CREATE INDEX "staff_documents_staffId_type_idx" ON "staff_documents"("staffId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_alerts_staffDocumentId_daysBefore_key" ON "compliance_alerts"("staffDocumentId", "daysBefore");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_staffId_key" ON "team_members"("teamId", "staffId");

-- CreateIndex
CREATE INDEX "leave_requests_staffId_startDate_idx" ON "leave_requests"("staffId", "startDate");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "recurring_series_status_idx" ON "recurring_series"("status");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_jobNo_key" ON "jobs"("jobNo");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_rescheduledFromId_key" ON "jobs"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "jobs_scheduledStart_idx" ON "jobs"("scheduledStart");

-- CreateIndex
CREATE INDEX "jobs_teamId_scheduledStart_idx" ON "jobs"("teamId", "scheduledStart");

-- CreateIndex
CREATE INDEX "jobs_clientId_scheduledStart_idx" ON "jobs"("clientId", "scheduledStart");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_deletedAt_idx" ON "jobs"("deletedAt");

-- CreateIndex
CREATE INDEX "job_lines_jobId_idx" ON "job_lines"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "job_assignments_jobId_staffId_key" ON "job_assignments"("jobId", "staffId");

-- CreateIndex
CREATE INDEX "job_checklist_items_jobId_idx" ON "job_checklist_items"("jobId");

-- CreateIndex
CREATE INDEX "job_photos_jobId_kind_idx" ON "job_photos"("jobId", "kind");

-- CreateIndex
CREATE INDEX "time_entries_staffId_clockInAt_idx" ON "time_entries"("staffId", "clockInAt");

-- CreateIndex
CREATE INDEX "time_entries_reviewStatus_idx" ON "time_entries"("reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNo_key" ON "tickets"("ticketNo");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ratingId_key" ON "tickets"("ratingId");

-- CreateIndex
CREATE INDEX "tickets_status_severity_idx" ON "tickets"("status", "severity");

-- CreateIndex
CREATE INDEX "tickets_clientId_idx" ON "tickets"("clientId");

-- CreateIndex
CREATE INDEX "ticket_comments_ticketId_createdAt_idx" ON "ticket_comments"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_counters_prefix_year_key" ON "document_counters"("prefix", "year");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNo_key" ON "invoices"("invoiceNo");

-- CreateIndex
CREATE INDEX "invoices_clientId_status_idx" ON "invoices"("clientId", "status");

-- CreateIndex
CREATE INDEX "invoices_status_dueDate_idx" ON "invoices"("status", "dueDate");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_paymentNo_key" ON "payments"("paymentNo");

-- CreateIndex
CREATE INDEX "payments_clientId_idx" ON "payments"("clientId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_receivedAt_idx" ON "payments"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_creditNoteNo_key" ON "credit_notes"("creditNoteNo");

-- CreateIndex
CREATE INDEX "credit_notes_clientId_idx" ON "credit_notes"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "packages_code_key" ON "packages"("code");

-- CreateIndex
CREATE UNIQUE INDEX "client_packages_packageNo_key" ON "client_packages"("packageNo");

-- CreateIndex
CREATE INDEX "client_packages_clientId_status_idx" ON "client_packages"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "package_usages_jobId_key" ON "package_usages"("jobId");

-- CreateIndex
CREATE INDEX "dunning_events_status_scheduledFor_idx" ON "dunning_events"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "dunning_events_invoiceId_step_key" ON "dunning_events"("invoiceId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_jobId_key" ON "ratings"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_token_key" ON "ratings"("token");

-- CreateIndex
CREATE INDEX "ratings_clientId_idx" ON "ratings"("clientId");

-- CreateIndex
CREATE INDEX "ratings_stars_idx" ON "ratings"("stars");

-- CreateIndex
CREATE UNIQUE INDEX "nps_responses_token_key" ON "nps_responses"("token");

-- CreateIndex
CREATE UNIQUE INDEX "nps_responses_clientId_quarter_key" ON "nps_responses"("clientId", "quarter");

-- CreateIndex
CREATE INDEX "client_risk_flags_status_score_idx" ON "client_risk_flags"("status", "score");

-- CreateIndex
CREATE INDEX "client_risk_flags_clientId_idx" ON "client_risk_flags"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaignId_clientId_key" ON "campaign_recipients"("campaignId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_code_key" ON "message_templates"("code");

-- CreateIndex
CREATE INDEX "message_logs_relatedEntity_relatedId_idx" ON "message_logs"("relatedEntity", "relatedId");

-- CreateIndex
CREATE INDEX "message_logs_clientId_createdAt_idx" ON "message_logs"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

-- CreateIndex
CREATE INDEX "stock_movements_itemId_occurredAt_idx" ON "stock_movements"("itemId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_consumables_jobId_itemId_key" ON "job_consumables"("jobId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_assetTag_key" ON "equipment"("assetTag");

-- CreateIndex
CREATE INDEX "equipment_nextMaintenanceDueAt_idx" ON "equipment"("nextMaintenanceDueAt");

-- CreateIndex
CREATE INDEX "equipment_maintenance_equipmentId_performedAt_idx" ON "equipment_maintenance"("equipmentId", "performedAt");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_travel_times" ADD CONSTRAINT "zone_travel_times_fromZoneId_fkey" FOREIGN KEY ("fromZoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_travel_times" ADD CONSTRAINT "zone_travel_times_toZoneId_fkey" FOREIGN KEY ("toZoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_items" ADD CONSTRAINT "rate_card_items_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_card_items" ADD CONSTRAINT "rate_card_items_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frequency_modifiers" ADD CONSTRAINT "frequency_modifiers_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedClientId_fkey" FOREIGN KEY ("convertedClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_referredByClientId_fkey" FOREIGN KEY ("referredByClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_properties" ADD CONSTRAINT "client_properties_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_properties" ADD CONSTRAINT "client_properties_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerClientId_fkey" FOREIGN KEY ("referrerClientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeClientId_fkey" FOREIGN KEY ("refereeClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeLeadId_fkey" FOREIGN KEY ("refereeLeadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_qualifyingJobId_fkey" FOREIGN KEY ("qualifyingJobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_staffDocumentId_fkey" FOREIGN KEY ("staffDocumentId") REFERENCES "staff_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_homeZoneId_fkey" FOREIGN KEY ("homeZoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "client_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "client_properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "recurring_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "checklist_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_lines" ADD CONSTRAINT "job_lines_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_lines" ADD CONSTRAINT "job_lines_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_checklist_items" ADD CONSTRAINT "job_checklist_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_checklist_items" ADD CONSTRAINT "job_checklist_items_templateItemId_fkey" FOREIGN KEY ("templateItemId") REFERENCES "checklist_template_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_checklist_items" ADD CONSTRAINT "job_checklist_items_checkedByStaffId_fkey" FOREIGN KEY ("checkedByStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_takenByStaffId_fkey" FOREIGN KEY ("takenByStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_raisedByStaffId_fkey" FOREIGN KEY ("raisedByStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "ratings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reCleanJobId_fkey" FOREIGN KEY ("reCleanJobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_usages" ADD CONSTRAINT "package_usages_clientPackageId_fkey" FOREIGN KEY ("clientPackageId") REFERENCES "client_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_usages" ADD CONSTRAINT "package_usages_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_events" ADD CONSTRAINT "dunning_events_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dunning_events" ADD CONSTRAINT "dunning_events_messageLogId_fkey" FOREIGN KEY ("messageLogId") REFERENCES "message_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nps_responses" ADD CONSTRAINT "nps_responses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_risk_flags" ADD CONSTRAINT "client_risk_flags_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_convertedJobId_fkey" FOREIGN KEY ("convertedJobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_consumables" ADD CONSTRAINT "job_consumables_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_consumables" ADD CONSTRAINT "job_consumables_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_maintenance" ADD CONSTRAINT "equipment_maintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
