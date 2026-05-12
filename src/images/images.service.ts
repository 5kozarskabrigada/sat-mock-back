import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class ImagesService {
  constructor(@Inject('DATABASE_POOL') private pool: Pool) {}

  async uploadImage(
    filename: string,
    contentType: string,
    fileSize: number,
    data: Buffer,
    uploadedBy?: string,
  ) {
    const result = await this.pool.query(
      `INSERT INTO images (filename, content_type, file_size, data, uploaded_by) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
      [filename, contentType, fileSize, data, uploadedBy || null],
    );

    return result.rows[0];
  }

  async getImage(id: string) {
    const result = await this.pool.query(
      `SELECT data, content_type, filename 
       FROM images 
       WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }
}
