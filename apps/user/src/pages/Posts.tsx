import { useEffect, useState } from 'react';
import { ConnectedAccount, Post } from '@syncpost/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@syncpost/ui';
import { api } from '../lib/api';
import { PostsList } from '../components/PostsList';

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [postsData, accountsData] = await Promise.all([
      api.get<Post[]>('/posts'),
      api.get<ConnectedAccount[]>('/social/accounts'),
    ]);
    setPosts(postsData);
    setAccounts(accountsData);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>All posts</CardTitle>
      </CardHeader>
      <CardContent>
        <PostsList posts={posts} loading={loading} onChanged={load} accounts={accounts} />
      </CardContent>
    </Card>
  );
}
