import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';

class PresignDto {
  filename: string;
  contentType: string;
}

@ApiTags('Uploads')
@Controller('api/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Get presigned URL to upload file' })
  @ApiBody({ schema: { example: { filename: 'photo.jpg', contentType: 'image/jpeg' } } })
  async presign(@Body() body: PresignDto) {
    const { filename, contentType } = body;
    const key = `uploads/${Date.now()}-${filename}`;
    const url = await this.uploadsService.getPresignedPutUrl(key, contentType, 300);
    return { url, key };
  }
}
