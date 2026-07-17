import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Users,
  MessageSquare,
  Share2,
  MapPin,
  FileText,
  Send,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Collaboration() {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isInCall, setIsInCall] = useState(false);
  const [message, setMessage] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.collaboration.state.useQuery();
  const sendMessageMutation = trpc.collaboration.sendMessage.useMutation({
    onSuccess: async () => {
      setMessage("");
      await utils.collaboration.state.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const onlineCount = useMemo(
    () => data?.participants.filter((p) => p.status === "online").length ?? 0,
    [data],
  );

  const startCall = () => {
    setIsInCall(true);
    toast.info("Live collaboration call controls are now connected to the shared workflow surface.");
  };

  const endCall = () => {
    setIsInCall(false);
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate({ message: message.trim() });
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading collaboration workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-2">
              ← Back to Dashboard
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Real-time Collaboration</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Users className="h-3 w-3" />
              {onlineCount} Online
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" />
                  Video Consultation
                </CardTitle>
                <CardDescription>
                  Coordinate surveyors, registrars, and citizens through the live collaboration workspace
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center text-white">
                      {!isVideoEnabled ? (
                        <div className="text-center">
                          <VideoOff className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-sm">Camera Off</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Video className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-sm">Your collaboration stream</p>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-white text-sm">You</div>
                    </div>

                    <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center text-white">
                      {!isInCall ? (
                        <div className="text-center">
                          <Users className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-sm">Waiting for participants...</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Users className="h-12 w-12 mx-auto mb-2" />
                          <p className="text-sm">Shared consultation channel active</p>
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-white text-sm">
                        {data.participants[0]?.name ?? "Workspace participant"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <Button variant={isAudioEnabled ? "default" : "destructive"} size="icon" onClick={() => setIsAudioEnabled((v) => !v)} disabled={!isInCall}>
                      {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    </Button>
                    <Button variant={isVideoEnabled ? "default" : "destructive"} size="icon" onClick={() => setIsVideoEnabled((v) => !v)} disabled={!isInCall}>
                      {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                    </Button>
                    <Button variant="secondary" size="icon" disabled={!isInCall}>
                      <Share2 className="h-4 w-4" />
                    </Button>
                    {!isInCall ? (
                      <Button onClick={startCall} className="gap-2">
                        <Phone className="h-4 w-4" />
                        Start Call
                      </Button>
                    ) : (
                      <Button onClick={endCall} variant="destructive" className="gap-2">
                        <PhoneOff className="h-4 w-4" />
                        End Call
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Shared Map Editing
                </CardTitle>
                <CardDescription>
                  View collaborative annotations and participant focus points from the shared workspace
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative h-96 border rounded-lg bg-gray-100">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <MapPin className="h-16 w-16 mx-auto mb-4" />
                      <p>Shared parcel workspace</p>
                      <p className="text-sm mt-2">Participant focus points and review notes are synchronized below.</p>
                    </div>
                  </div>

                  {data.participants.filter((p) => p.cursor).map((participant) => (
                    <div
                      key={participant.id}
                      className="absolute w-4 h-4 rounded-full border-2 border-white shadow-lg"
                      style={{
                        left: participant.cursor!.x,
                        top: participant.cursor!.y,
                        backgroundColor: participant.role === "Surveyor" ? "#3b82f6" : "#10b981",
                      }}
                    >
                      <div className="absolute left-5 top-0 whitespace-nowrap px-2 py-1 bg-black/70 text-white text-xs rounded">
                        {participant.name}
                      </div>
                    </div>
                  ))}

                  {data.annotations.map((annotation) => (
                    <div key={annotation.id} className="absolute" style={{ left: annotation.x, top: annotation.y }}>
                      <div className="px-3 py-2 rounded-lg shadow-lg text-white text-sm max-w-xs" style={{ backgroundColor: annotation.color }}>
                        <p className="font-semibold text-xs mb-1">{annotation.author}</p>
                        <p>{annotation.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Participants ({data.participants.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold">
                          {participant.name.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${participant.status === "online" ? "bg-green-500" : "bg-yellow-500"}`} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{participant.name}</p>
                        <p className="text-xs text-muted-foreground">{participant.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Chat
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="h-64 overflow-y-auto space-y-3 p-2">
                    {data.messages.map((msg) => (
                      <div key={msg.id} className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-sm">{msg.sender}</span>
                          <span className="text-xs text-muted-foreground">{msg.time}</span>
                        </div>
                        <p className="text-sm bg-muted p-2 rounded-lg">{msg.message}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    />
                    <Button onClick={sendMessage} size="icon" disabled={sendMessageMutation.isPending}>
                      {sendMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Shared Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.documents.map((document) => (
                    <div key={document.id} className="p-3 border rounded-lg hover:bg-muted cursor-pointer">
                      <p className="font-semibold text-sm">{document.name}</p>
                      <p className="text-xs text-muted-foreground">{document.annotations} annotations</p>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full gap-2" onClick={() => toast.info("Use the live document validation and document management flows to add new shared files") }>
                    <FileText className="h-4 w-4" />
                    Add Document
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
