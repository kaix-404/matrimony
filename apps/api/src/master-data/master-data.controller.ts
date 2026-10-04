import { Controller, Get } from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import type { MasterListsResponse, NetWorthCategoryOption } from '@matrimony/shared';

/**
 * Reference data for pickers in the app.
 *
 * Public rather than authenticated: these lists are not user data, and the app
 * needs them on the sign-up screen before anyone has a session. Caching is
 * appropriate here (they change only when an admin edits them), so this is one
 * of the few endpoints that can safely be cached — the response still carries
 * no user data, so there is nothing here to leak from a shared cache.
 */
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get('lists')
  async lists(): Promise<MasterListsResponse> {
    return this.masterData.lists();
  }

  /**
   * The net-worth bands.
   *
   * Public because registration needs them before a session exists, and because
   * two-way visibility lets a signed-in user edit their own selections from a
   * screen that must not wait on a network round trip to render the options.
   */
  @Get('net-worth-categories')
  async netWorthCategories(): Promise<NetWorthCategoryOption[]> {
    return this.masterData.netWorthCategories();
  }
}
