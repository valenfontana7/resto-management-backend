import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { BranchesService } from './services/branches.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { OwnershipService } from '../common/services/ownership.service';

class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  email: string;
}

@ApiTags('Branches')
@ApiBearerAuth()
@Controller('restaurants/:restaurantId/branches')
export class BranchesController {
  constructor(
    private branchesService: BranchesService,
    private ownership: OwnershipService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all branches of a restaurant' })
  @ApiResponse({ status: 200, description: 'List of branches' })
  async listBranches(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.branchesService.listBranches(restaurantId);
  }

  @Get('info')
  @ApiOperation({ summary: 'Get branch info (is main, count)' })
  async getBranchInfo(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.branchesService.getParentInfo(restaurantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new branch' })
  @ApiResponse({ status: 201, description: 'Branch created' })
  async createBranch(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateBranchDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.branchesService.createBranch(restaurantId, dto);
  }

  @Delete(':branchId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a branch' })
  async deleteBranch(
    @Param('restaurantId') restaurantId: string,
    @Param('branchId') branchId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return this.branchesService.deleteBranch(restaurantId, branchId);
  }
}
