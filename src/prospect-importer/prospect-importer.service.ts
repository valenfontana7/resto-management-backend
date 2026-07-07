import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BundleValidationError,
  ImportOptions,
  ProspectImporter,
} from './importer';
import { validateBundle } from './validator';
import type { ImportReport, ProspectBundle, ValidationResult } from './types';

@Injectable()
export class ProspectImporterService {
  private readonly importer: ProspectImporter;

  constructor(private readonly prisma: PrismaService) {
    this.importer = new ProspectImporter(this.prisma);
  }

  validateBundle(bundle: ProspectBundle): ValidationResult {
    return validateBundle(bundle);
  }

  importBundle(
    bundle: ProspectBundle,
    options: ImportOptions = {},
  ): Promise<ImportReport> {
    return this.importer.importBundle(bundle, options);
  }
}

export { BundleValidationError };
