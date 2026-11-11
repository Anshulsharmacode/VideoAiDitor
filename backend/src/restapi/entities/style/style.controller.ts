import { Controller, Get, Param } from '@nestjs/common';
import { StyleService } from './style.service.js';

@Controller('api/v1/styles')
export class StyleController {
  constructor(private readonly styleService: StyleService) {}

  @Get()
  list() {
    return this.styleService.list();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.styleService.getOne(id);
  }
}
