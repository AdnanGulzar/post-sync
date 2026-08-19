import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PublishDraftDto } from './dto/publish-draft.dto';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('posts')
export class PostsController {
  constructor(private postsService: PostsService) {}

  @Get()
  listMine(@CurrentUser() user: any) {
    return this.postsService.listMine(user.id);
  }

  // Declared before ":id" below so "analytics" doesn't get captured as an id —
  // Nest/Express match routes in declaration order.
  @Get('analytics')
  analytics(@CurrentUser() user: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.postsService.getAnalytics(user.id, from, to);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreatePostDto) {
    return this.postsService.createAndPublish(user.id, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.updateContent(user.id, id, dto.content);
  }

  // Turns an existing draft into a real post — publishing it now or scheduling it.
  @Post(':id/publish')
  publishDraft(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: PublishDraftDto) {
    return this.postsService.publishDraft(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.remove(user.id, id);
  }
}
