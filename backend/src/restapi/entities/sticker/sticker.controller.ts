import { Controller, Get, Param, Query } from '@nestjs/common';
import { StickerService } from './sticker.service.js';

@Controller('api/v1/stickers')
export class StickerController {
  constructor(private readonly stickerService: StickerService) {}

  @Get()
  list(@Query('tag') tag?: string) {
    return this.stickerService.list(tag);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.stickerService.getOne(id);
  }
}
