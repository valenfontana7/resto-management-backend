import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { ImageProcessingService } from '../services/image-processing.service';

export const IMAGE_FIELDS_KEY = 'imageFields';

/**
 * Decorador para especificar qué campos de imagen transformar en la respuesta
 * @param fields Lista de campos que contienen URLs de imagen
 */
export const TransformImageFields = (...fields: string[]) =>
  Reflect.metadata(IMAGE_FIELDS_KEY, fields);

/**
 * Interceptor que transforma automáticamente los campos de imagen
 * en las respuestas, convirtiendo S3 keys a URLs públicas.
 *
 * Uso:
 * ```typescript
 * @UseInterceptors(ImageTransformInterceptor)
 * @TransformImageFields('image', 'logo', 'coverImage')
 * @Get('dishes')
 * async getDishes() { ... }
 * ```
 */
@Injectable()
export class ImageTransformInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const fields = this.reflector.get<string[]>(
      IMAGE_FIELDS_KEY,
      context.getHandler(),
    );

    if (!fields || fields.length === 0) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        if (!data) return data;
        return this.transformResponse(data, fields);
      }),
    );
  }

  private transformResponse(data: any, fields: string[]): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.transformObject(item, fields));
    }

    if (typeof data === 'object' && data !== null) {
      // Si el objeto tiene propiedades conocidas como 'items', 'data', 'dishes', etc.
      const wrapperKeys = [
        'items',
        'data',
        'dishes',
        'categories',
        'orders',
        'restaurants',
        'results',
      ];
      for (const key of wrapperKeys) {
        if (Array.isArray(data[key])) {
          return {
            ...data,
            [key]: data[key].map((item: any) =>
              this.transformObject(item, fields),
            ),
          };
        }
      }

      return this.transformObject(data, fields);
    }

    return data;
  }

  private transformObject(obj: any, fields: string[]): any {
    if (!obj || typeof obj !== 'object') return obj;

    return this.imageProcessing.transformImageFields(obj, fields);
  }
}
