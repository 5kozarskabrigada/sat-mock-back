import {
  Controller,
  Post,
  Get,
  Param,
  BadRequestException,
  NotFoundException,
  Res,
  Req,
} from '@nestjs/common';
import { ImagesService } from './images.service';
import { FastifyReply, FastifyRequest } from 'fastify';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload')
  async uploadImage(@Req() req: FastifyRequest) {
    try {
      const data = await req.file();

      if (!data) {
        throw new BadRequestException('No file provided');
      }

      // Get file buffer
      const buffer = await data.toBuffer();

      // Validate file type
      if (!ALLOWED_TYPES.includes(data.mimetype)) {
        throw new BadRequestException('Only image files are allowed');
      }

      // Validate file size
      if (buffer.length > MAX_FILE_SIZE) {
        throw new BadRequestException('File size must be less than 5MB');
      }

      const extension =
        data.filename.split('.').pop()?.toLowerCase() || 'bin';
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;

      const result = await this.imagesService.uploadImage(
        filename,
        data.mimetype,
        buffer.length,
        buffer,
      );

      return {
        url: `/api/images/${result.id}`,
        id: result.id,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Upload failed');
    }
  }

  @Get(':id')
  async getImage(@Param('id') id: string, @Res() res: FastifyReply) {
    const image = await this.imagesService.getImage(id);

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    res
      .header('Content-Type', image.content_type)
      .header('Content-Disposition', `inline; filename="${image.filename}"`)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .send(image.data);
  }
}
