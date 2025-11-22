import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { MenuModule } from './menu/menu.module';

@Module({
  imports: [RestaurantsModule, MenuModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
