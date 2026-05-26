import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ClassroomsService } from './classrooms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('classrooms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassroomsController {
  constructor(private classroomsService: ClassroomsService) {}

  @Get()
  async findAll() {
    return this.classroomsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.classroomsService.findOne(id);
  }

  @Get(':id/students')
  async getStudents(@Param('id') id: string) {
    return this.classroomsService.getStudents(id);
  }

  @Post()
  @Roles('admin')
  async create(@Body() classroomData: any) {
    return this.classroomsService.create(classroomData);
  }

  @Put(':id')
  @Roles('admin')
  async update(@Param('id') id: string, @Body() classroomData: any) {
    return this.classroomsService.update(id, classroomData);
  }

  @Delete(':id')
  @Roles('admin')
  async delete(@Param('id') id: string) {
    return this.classroomsService.delete(id);
  }

  @Post(':id/students')
  @Roles('admin')
  async addStudent(@Param('id') id: string, @Body() data: { studentId: string }) {
    return this.classroomsService.addStudent(id, data.studentId);
  }

  @Delete(':id/students/:studentId')
  @Roles('admin')
  async removeStudent(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.classroomsService.removeStudent(id, studentId);
  }
}
