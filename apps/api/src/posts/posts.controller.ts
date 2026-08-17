import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get()
  listMine(@CurrentUser() user: any) {
    return this.postsService.listMine(user.id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreatePostDto) {
    return this.postsService.createAndPublish(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.updateContent(user.id, id, dto.content);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.remove(user.id, id);
  }
}
