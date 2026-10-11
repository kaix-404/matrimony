import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listUsers(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.adminService.listUsers(limit ? Number(limit) : 20, cursor);
  }
}
