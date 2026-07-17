import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Loader2, CheckCircle2, XCircle, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function DroneProcessing() {
  const [projectName, setProjectName] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageInput, setImageInput] = useState('');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  const [options, setOptions] = useState({
    dsm: true,
    dtm: true,
    orthophoto: true,
    pointCloud: true,
    mesh: false,
    geoLocation: true,
  });

  const submitImagery = trpc.drone.submitImagery.useMutation({
    onSuccess: (data) => {
      toast.success('Processing Started', {
        description: `Task ${data.id} has been queued for processing`,
      });
      setProjectName('');
      setImageUrls([]);
      setImageInput('');
      tasksQuery.refetch();
    },
    onError: (error) => {
      toast.error('Submission Failed', {
        description: error.message,
      });
    },
  });

  const tasksQuery = trpc.drone.listTasks.useQuery(undefined, {
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const taskStatusQuery = trpc.drone.getTaskStatus.useQuery(
    { taskId: selectedTask! },
    { 
      enabled: !!selectedTask,
      refetchInterval: 3000, // Poll every 3 seconds when viewing a task
    }
  );

  const cancelTask = trpc.drone.cancelTask.useMutation({
    onSuccess: () => {
      toast.success('Task Cancelled', {
        description: 'Processing task has been cancelled',
      });
      tasksQuery.refetch();
    },
  });

  const handleAddImage = () => {
    if (imageInput.trim()) {
      setImageUrls([...imageUrls, imageInput.trim()]);
      setImageInput('');
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!projectName || imageUrls.length === 0) {
      toast.error('Validation Error', {
        description: 'Please provide a project name and at least one image',
      });
      return;
    }

    submitImagery.mutate({
      name: projectName,
      images: imageUrls,
      options,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      queued: 'secondary',
      processing: 'default',
      completed: 'outline',
      failed: 'destructive',
    };
    
    const icons = {
      queued: <Loader2 className="h-3 w-3 mr-1" />,
      processing: <Loader2 className="h-3 w-3 mr-1 animate-spin" />,
      completed: <CheckCircle2 className="h-3 w-3 mr-1" />,
      failed: <XCircle className="h-3 w-3 mr-1" />,
    };

    return (
      <Badge variant={variants[status] || 'default'} className="flex items-center w-fit">
        {icons[status as keyof typeof icons]}
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Drone Imagery Processing</h1>
        <p className="text-muted-foreground">
          Process drone imagery to generate orthophotos, 3D models, and terrain analysis
        </p>
      </div>

      <Tabs defaultValue="submit" className="space-y-6">
        <TabsList>
          <TabsTrigger value="submit">Submit New Project</TabsTrigger>
          <TabsTrigger value="tasks">Processing Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="submit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Drone Images</CardTitle>
              <CardDescription>
                Provide drone imagery URLs for processing. Images should include GPS EXIF data for best results.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  placeholder="e.g., Abuja District Survey 2026"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URLs</Label>
                <div className="flex gap-2">
                  <Input
                    id="imageUrl"
                    placeholder="https://storage.example.com/drone/image001.jpg"
                    value={imageInput}
                    onChange={(e) => setImageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddImage()}
                  />
                  <Button onClick={handleAddImage} variant="outline">
                    Add
                  </Button>
                </div>
                {imageUrls.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium">{imageUrls.length} images added:</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {imageUrls.map((url, index) => (
                        <div key={index} className="flex items-center justify-between bg-muted p-2 rounded text-sm">
                          <span className="truncate flex-1">{url}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveImage(index)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <Label>Processing Options</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="orthophoto"
                      checked={options.orthophoto}
                      onCheckedChange={(checked) =>
                        setOptions({ ...options, orthophoto: checked as boolean })
                      }
                    />
                    <label htmlFor="orthophoto" className="text-sm cursor-pointer">
                      Generate Orthophoto
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="dsm"
                      checked={options.dsm}
                      onCheckedChange={(checked) =>
                        setOptions({ ...options, dsm: checked as boolean })
                      }
                    />
                    <label htmlFor="dsm" className="text-sm cursor-pointer">
                      Digital Surface Model (DSM)
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="dtm"
                      checked={options.dtm}
                      onCheckedChange={(checked) =>
                        setOptions({ ...options, dtm: checked as boolean })
                      }
                    />
                    <label htmlFor="dtm" className="text-sm cursor-pointer">
                      Digital Terrain Model (DTM)
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="pointCloud"
                      checked={options.pointCloud}
                      onCheckedChange={(checked) =>
                        setOptions({ ...options, pointCloud: checked as boolean })
                      }
                    />
                    <label htmlFor="pointCloud" className="text-sm cursor-pointer">
                      Point Cloud
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="mesh"
                      checked={options.mesh}
                      onCheckedChange={(checked) =>
                        setOptions({ ...options, mesh: checked as boolean })
                      }
                    />
                    <label htmlFor="mesh" className="text-sm cursor-pointer">
                      3D Textured Mesh
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="geoLocation"
                      checked={options.geoLocation}
                      onCheckedChange={(checked) =>
                        setOptions({ ...options, geoLocation: checked as boolean })
                      }
                    />
                    <label htmlFor="geoLocation" className="text-sm cursor-pointer">
                      Use GPS Data from Images
                    </label>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={submitImagery.isPending}
                className="w-full"
                size="lg"
              >
                {submitImagery.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Start Processing
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-6">
          {tasksQuery.isLoading ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Loading tasks...</p>
              </CardContent>
            </Card>
          ) : tasksQuery.data && tasksQuery.data.length > 0 ? (
            <div className="grid gap-4">
              {tasksQuery.data.map((task) => (
                <Card key={task.id} className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => setSelectedTask(task.id)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{task.name}</CardTitle>
                      {getStatusBadge(task.status)}
                    </div>
                    <CardDescription>
                      Started {new Date(task.createdAt).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Progress</span>
                        <span className="font-medium">{task.progress}%</span>
                      </div>
                      <Progress value={task.progress} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No processing tasks yet</p>
              </CardContent>
            </Card>
          )}

          {selectedTask && taskStatusQuery.data && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Task Details</CardTitle>
                  {getStatusBadge(taskStatusQuery.data.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">Task ID</p>
                  <p className="text-sm text-muted-foreground font-mono">{taskStatusQuery.data.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Project Name</p>
                  <p className="text-sm text-muted-foreground">{taskStatusQuery.data.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">Progress</p>
                  <Progress value={taskStatusQuery.data.progress} className="mb-2" />
                  <p className="text-sm text-muted-foreground">{taskStatusQuery.data.progress}% complete</p>
                </div>

                {taskStatusQuery.data.outputs && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Outputs</p>
                    <div className="grid gap-2">
                      {taskStatusQuery.data.outputs.orthophoto && (
                        <div className="flex items-center justify-between bg-muted p-3 rounded">
                          <span className="text-sm">Orthophoto</span>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <a href={taskStatusQuery.data.outputs.orthophoto} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </a>
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a href={taskStatusQuery.data.outputs.orthophoto} download>
                                <Download className="h-3 w-3 mr-1" />
                                Download
                              </a>
                            </Button>
                          </div>
                        </div>
                      )}
                      {taskStatusQuery.data.outputs.dsm && (
                        <div className="flex items-center justify-between bg-muted p-3 rounded">
                          <span className="text-sm">Digital Surface Model</span>
                          <Button size="sm" variant="outline" asChild>
                            <a href={taskStatusQuery.data.outputs.dsm} download>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </a>
                          </Button>
                        </div>
                      )}
                      {taskStatusQuery.data.outputs.dtm && (
                        <div className="flex items-center justify-between bg-muted p-3 rounded">
                          <span className="text-sm">Digital Terrain Model</span>
                          <Button size="sm" variant="outline" asChild>
                            <a href={taskStatusQuery.data.outputs.dtm} download>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </a>
                          </Button>
                        </div>
                      )}
                      {taskStatusQuery.data.outputs.pointCloud && (
                        <div className="flex items-center justify-between bg-muted p-3 rounded">
                          <span className="text-sm">Point Cloud</span>
                          <Button size="sm" variant="outline" asChild>
                            <a href={taskStatusQuery.data.outputs.pointCloud} download>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </a>
                          </Button>
                        </div>
                      )}
                      {taskStatusQuery.data.outputs.mesh && (
                        <div className="flex items-center justify-between bg-muted p-3 rounded">
                          <span className="text-sm">3D Mesh</span>
                          <Button size="sm" variant="outline" asChild>
                            <a href={taskStatusQuery.data.outputs.mesh} download>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </a>
                          </Button>
                        </div>
                      )}
                      {taskStatusQuery.data.outputs.report && (
                        <div className="flex items-center justify-between bg-muted p-3 rounded">
                          <span className="text-sm">Processing Report</span>
                          <Button size="sm" variant="outline" asChild>
                            <a href={taskStatusQuery.data.outputs.report} download>
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {taskStatusQuery.data.status === 'processing' && (
                  <Button
                    variant="destructive"
                    onClick={() => cancelTask.mutate({ taskId: selectedTask })}
                    disabled={cancelTask.isPending}
                    className="w-full"
                  >
                    {cancelTask.isPending ? 'Cancelling...' : 'Cancel Task'}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
