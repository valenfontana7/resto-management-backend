import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateDemoExampleDto } from './dto/create-demo-example.dto';
import { UpdateDemoExampleDto } from './dto/update-demo-example.dto';
import { DemoExamplesService } from './demo-examples.service';

@Public()
@Controller('api/demo-examples')
export class PublicDemoExamplesController {
  constructor(private readonly demoExamplesService: DemoExamplesService) {}

  @Get()
  async findPublic() {
    return this.demoExamplesService.findPublic();
  }
}

@Controller('api/master/demo-examples')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class MasterDemoExamplesController {
  constructor(private readonly demoExamplesService: DemoExamplesService) {}

  @Get()
  async findAll() {
    return this.demoExamplesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.demoExamplesService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateDemoExampleDto, @Request() req) {
    return this.demoExamplesService.create(dto, req.user?.userId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDemoExampleDto,
    @Request() req,
  ) {
    return this.demoExamplesService.update(id, dto, req.user?.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Request() req) {
    await this.demoExamplesService.remove(id, req.user?.userId);
  }
}
