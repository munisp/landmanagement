import { useState } from 'react';
import { CommentThread, Comment } from './CommentThread';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

interface ConnectedCommentThreadProps {
  entityType: 'parcel' | 'transaction';
  entityId: string;
}

export function ConnectedCommentThread({ entityType, entityId }: ConnectedCommentThreadProps) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Listen for real-time updates
  useRealTimeUpdates((event) => {
    if (event.type === 'comment_added' && event.entityType === entityType && event.entityId === entityId) {
      // Invalidate to refetch comments
      utils.comments.list.invalidate({ entityType, entityId });
    } else if (event.type === 'comment_edited' && event.entityType === entityType && event.entityId === entityId) {
      utils.comments.list.invalidate({ entityType, entityId });
    } else if (event.type === 'comment_deleted' && event.entityType === entityType && event.entityId === entityId) {
      utils.comments.list.invalidate({ entityType, entityId });
    }
  }, [entityType, entityId, utils]);

  const { data: comments = [], isLoading } = trpc.comments.list.useQuery({
    entityType,
    entityId,
  });

  const addComment = trpc.comments.add.useMutation({
    onSuccess: () => {
      utils.comments.list.invalidate({ entityType, entityId });
    },
  });

  const editComment = trpc.comments.edit.useMutation({
    onSuccess: () => {
      utils.comments.list.invalidate({ entityType, entityId });
    },
  });

  const deleteComment = trpc.comments.delete.useMutation({
    onSuccess: () => {
      utils.comments.list.invalidate({ entityType, entityId });
    },
  });

  const handleAddComment = async (content: string) => {
    await addComment.mutateAsync({ entityType, entityId, content });
  };

  const handleEditComment = async (id: string, content: string) => {
    await editComment.mutateAsync({ id, content });
  };

  const handleDeleteComment = async (id: string) => {
    await deleteComment.mutateAsync({ id });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Please sign in to view and add comments</p>
      </div>
    );
  }

  // Transform API comments to CommentThread format
  const transformedComments: Comment[] = comments.map((comment) => ({
    id: String(comment.id),
    userId: comment.userId,
    userName: comment.userName || 'Unknown User',
    userAvatar: comment.userAvatar,
    content: comment.content,
    createdAt: new Date(comment.createdAt),
    updatedAt: comment.updatedAt ? new Date(comment.updatedAt) : undefined,
    isEdited: comment.updatedAt ? new Date(comment.updatedAt).getTime() > new Date(comment.createdAt).getTime() : false,
  }));

  return (
    <CommentThread
      comments={transformedComments}
      currentUserId={user.id}
      onAddComment={handleAddComment}
      onEditComment={handleEditComment}
      onDeleteComment={handleDeleteComment}
      placeholder="Add a comment..."
      emptyMessage="No comments yet. Be the first to comment!"
    />
  );
}
