import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { HealthModule } from '../health/health.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminMasterDataController } from './master-data.admin.controller';
import { AdminMasterDataService } from './master-data.admin.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminTokenService } from './admin-token.service';
import { AuditService } from './audit.service';
import { AdminAuthGuard } from './rbac/admin-auth.guard';
import { PermissionsGuard } from './rbac/permissions.guard';

/**
 * Admin surface and its RBAC foundation.
 *
 * `AdminAuthGuard` and `PermissionsGuard` are provided here so they can inject
 * `AdminTokenService`, `Reflector` and `PrismaClient`; controllers opt in with
 * `@UseGuards(AdminAuthGuard, PermissionsGuard)`. `AdminAuthController` is the
 * one unguarded admin controller: it issues the token the guarded ones require.
 * `AuditService` is exported so the write paths that land in this module
 * (category changes, manual grants) can record to the append-only log without
 * importing the whole module.
 */
@Module({
  // `HealthModule` supplies the readiness report the System status page reads;
  // it is exported for that one route. It imports nothing from here, so the
  // dependency stays one-way.
  imports: [PrismaModule, AuthModule, NotificationsModule, StorageModule, HealthModule],
  providers: [
    AdminService,
    AdminMasterDataService,
    AdminAuthService,
    AdminTokenService,
    AuditService,
    AdminAuthGuard,
    PermissionsGuard,
  ],
  controllers: [AdminController, AdminMasterDataController, AdminAuthController],
  exports: [AdminService, AuditService, AdminTokenService],
})
export class AdminModule {}
