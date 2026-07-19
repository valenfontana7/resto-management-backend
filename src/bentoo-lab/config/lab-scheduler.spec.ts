import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Cron,
  Interval,
  ScheduleModule,
  SchedulerRegistry,
  Timeout,
} from '@nestjs/schedule';
import { getSchedulerOptions } from '../../common/config/bentoo-mode.config';

@Injectable()
class SchedulerProbe {
  @Cron('* * * * * *')
  cron(): void {}

  @Interval(1_000)
  interval(): void {}

  @Timeout(1_000)
  timeout(): void {}
}

describe('ScheduleModule en Lab', () => {
  it('no descubre cron jobs, intervals ni timeouts', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ScheduleModule.forRoot(
          getSchedulerOptions({ BENTOO_RUNTIME_MODE: 'lab' }),
        ),
      ],
      providers: [SchedulerProbe],
    }).compile();

    await moduleRef.init();
    const registry = moduleRef.get(SchedulerRegistry);

    expect(registry.getCronJobs().size).toBe(0);
    expect(registry.getIntervals()).toHaveLength(0);
    expect(registry.getTimeouts()).toHaveLength(0);

    await moduleRef.close();
  });
});
