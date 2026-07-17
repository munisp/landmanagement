import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Box, Mountain, Sun, Droplets, Eye, Download, RotateCcw, Maximize2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { trpc } from "@/lib/trpc";

export default function Building3DVisualization() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const [buildingHeight, setBuildingHeight] = useState([15]);
  const [terrainType, setTerrainType] = useState("flat");
  const [viewMode, setViewMode] = useState("3d");
  const [showShadows, setShowShadows] = useState(true);
  const [showFloodRisk, setShowFloodRisk] = useState(false);

  const { data, isLoading } = trpc.buildingVisualization.state.useQuery();

  useEffect(() => {
    if (!canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);

    const camera = new THREE.PerspectiveCamera(75, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 1000);
    camera.position.set(30, 30, 30);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.shadowMap.enabled = showShadows;
    canvasRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 25);
    directionalLight.castShadow = showShadows;
    scene.add(directionalLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: terrainType === "flat" ? 0x90ee90 : terrainType === "slope" ? 0xc2b280 : 0x7fb069 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    scene.add(new THREE.GridHelper(100, 50, 0x888888, 0xcccccc));

    const points = (data?.boundaryCoordinates ?? "6.4281,3.4219;6.4285,3.4219;6.4285,3.4225;6.4281,3.4225")
      .split(";")
      .map((pair: string, index: number) => {
        const [lat, lng] = pair.split(",").map(Number);
        return new THREE.Vector3((index % 2 === 0 ? -15 : 15), 0.1, lat && lng ? (index < 2 ? -15 : 15) : -15);
      });
    const boundaryLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xff0000 }));
    scene.add(boundaryLine);

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(20, buildingHeight[0], 20),
      new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.7, metalness: 0.1 }),
    );
    building.position.y = buildingHeight[0] / 2;
    building.castShadow = showShadows;
    scene.add(building);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(14, 5, 4), new THREE.MeshStandardMaterial({ color: 0x8b0000 }));
    roof.position.y = buildingHeight[0] + 2.5;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = showShadows;
    scene.add(roof);

    if (showFloodRisk) {
      const floodPlane = new THREE.Mesh(
        new THREE.CircleGeometry(20, 32),
        new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.35 }),
      );
      floodPlane.rotation.x = -Math.PI / 2;
      floodPlane.position.y = 0.05;
      scene.add(floodPlane);
    }

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!canvasRef.current) return;
      camera.aspect = canvasRef.current.clientWidth / canvasRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      if (canvasRef.current?.contains(renderer.domElement)) {
        canvasRef.current.removeChild(renderer.domElement);
      }
    };
  }, [buildingHeight, terrainType, showFloodRisk, showShadows, data?.boundaryCoordinates]);

  const resetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(30, 30, 30);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading parcel visualization...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-900 dark:to-slate-800">
      <div className="bg-white dark:bg-slate-900 border-b">
        <div className="container mx-auto py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
              <Box className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">3D Building Visualization</h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">Interactive 3D parcel and building analysis</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">View Controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>View Mode</Label>
                  <Select value={viewMode} onValueChange={setViewMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3d">3D Perspective</SelectItem>
                      <SelectItem value="top">Top View</SelectItem>
                      <SelectItem value="side">Side View</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Building Height: {buildingHeight[0]}m</Label>
                  <Slider value={buildingHeight} onValueChange={setBuildingHeight} min={5} max={50} step={1} className="mt-2" />
                </div>

                <div>
                  <Label>Terrain Type</Label>
                  <Select value={terrainType} onValueChange={setTerrainType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat</SelectItem>
                      <SelectItem value="slope">Sloped</SelectItem>
                      <SelectItem value="hill">Hilly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Show Shadows</Label>
                  <input type="checkbox" checked={showShadows} onChange={(e) => setShowShadows(e.target.checked)} className="h-4 w-4" />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Flood Risk Overlay</Label>
                  <input type="checkbox" checked={showFloodRisk} onChange={(e) => setShowFloodRisk(e.target.checked)} className="h-4 w-4" />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={resetView} className="flex-1"><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
                  <Button variant="outline" size="sm" className="flex-1"><Maximize2 className="mr-2 h-4 w-4" />Fullscreen</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Analysis Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2"><Sun className="h-5 w-5 text-yellow-500" /><div><p className="text-sm font-medium">Solar Potential</p><p className="text-xs text-slate-500">{data.solarPotential.toLocaleString()} kWh/year</p></div></div>
                <div className="flex items-center gap-2"><Droplets className="h-5 w-5 text-blue-500" /><div><p className="text-sm font-medium">Flood Risk</p><Badge variant="outline" className="text-xs">{data.floodRisk}</Badge></div></div>
                <div className="flex items-center gap-2"><Mountain className="h-5 w-5 text-green-500" /><div><p className="text-sm font-medium">Elevation</p><p className="text-xs text-slate-500">{data.elevationMeters}m above sea level</p></div></div>
                <div className="flex items-center gap-2"><Eye className="h-5 w-5 text-purple-500" /><div><p className="text-sm font-medium">Viewshed Score</p><p className="text-xs text-slate-500">{data.viewshedScore}/10</p></div></div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>3D Visualization</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Export</Button>
                  </div>
                </div>
                <CardDescription>Parcel ID: {data.parcelId} | {data.location}</CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={canvasRef} className="w-full h-[600px] bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden" />
                <div className="mt-4 grid grid-cols-4 gap-4">
                  <div className="text-center"><p className="text-sm text-slate-500">Building Area</p><p className="text-lg font-bold">{data.buildingArea} m²</p></div>
                  <div className="text-center"><p className="text-sm text-slate-500">Plot Coverage</p><p className="text-lg font-bold">{data.plotCoverage}%</p></div>
                  <div className="text-center"><p className="text-sm text-slate-500">Floor Area Ratio</p><p className="text-lg font-bold">{data.floorAreaRatio}</p></div>
                  <div className="text-center"><p className="text-sm text-slate-500">Setback</p><p className="text-lg font-bold">{data.setbackMeters}m</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
