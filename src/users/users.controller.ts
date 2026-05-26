import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  async getCurrentUser(@Request() req: any) {
    return this.usersService.findOne(req.user.id);
  }

  @Get()
  @Roles('admin')
  async findAll(@Query() filters: any) {
    return this.usersService.findAll(filters);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    // Students can only view their own profile
    if (req.user.role === 'student' && id !== req.user.id) {
      return { error: 'Unauthorized' };
    }
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('admin')
  async create(@Body() userData: any) {
    return this.usersService.create(userData);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() userData: any,
    @Request() req: any,
  ) {
    // Students can only update their own profile
    if (req.user.role === 'student' && id !== req.user.id) {
      return { error: 'Unauthorized' };
    }
    return this.usersService.update(id, userData);
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
