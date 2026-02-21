import WorldGlobe from "./Globe";

export default function App() {
  const mockMaterials = [
    { name: "Cotton", origin: "India", percentage: 60, lat: 20.5937, lng: 78.9629 },
    { name: "Dye", origin: "Germany", percentage: 25, lat: 51.1657, lng: 10.4515 },
    { name: "Packaging", origin: "China", percentage: 15, lat: 35.8617, lng: 104.1954 },
  ];

  return (
    <div style={{ 
      background: "#000", 
      width: "100vw", 
      height: "100vh", 
      margin: 0, 
      padding: 0, 
      overflow: "hidden" 
    }}>
      <WorldGlobe materials={mockMaterials} />
    </div>
  );
}