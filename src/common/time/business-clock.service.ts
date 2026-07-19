import { Injectable } from '@nestjs/common';
import { ExecutionContextService } from '../execution/execution-context.service';

@Injectable()
export class BusinessClockService {
  constructor(private readonly executionContext: ExecutionContextService) {}

  now(): Date {
    const simulatedNow = this.executionContext.get()?.simulatedNow;
    return simulatedNow ? new Date(simulatedNow) : this.technicalNow();
  }

  technicalNow(): Date {
    return new Date();
  }
}
