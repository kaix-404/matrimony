import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  RegisterDeviceTokenSchema,
  type AccessTokenClaims,
  type DeviceTokenListResponse,
  type DeviceTokenResponse,
  type RegisterDeviceTokenRequest,
} from '@matrimony/shared';
import { AuthUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { DeviceTokensService } from './device-tokens.service';

/**
 * Push device registration (section 42). The mobile app registers its FCM token
 * after login and removes it on logout.
 *
 * The token is carried in the request body on registration and as a path segment
 * on deletion. It is a device secret, so it is never returned in a response.
 */
@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DeviceTokensController {
  constructor(private readonly devices: DeviceTokensService) {}

  @Post()
  async register(
    @AuthUser() claims: AccessTokenClaims,
    @Body(new ZodValidationPipe(RegisterDeviceTokenSchema)) body: RegisterDeviceTokenRequest,
  ): Promise<DeviceTokenResponse> {
    return this.devices.register(claims.sub, body);
  }

  @Get()
  async list(@AuthUser() claims: AccessTokenClaims): Promise<DeviceTokenListResponse> {
    return { devices: await this.devices.listForUser(claims.sub) };
  }

  @Delete(':token')
  @HttpCode(204)
  async unregister(
    @AuthUser() claims: AccessTokenClaims,
    @Param('token') token: string,
  ): Promise<void> {
    await this.devices.unregister(claims.sub, token);
  }
}
