// Feature flags configuration
export const features = {
  // Enable real-time streaming of Claude responses
  STREAMING_ENABLED: process.env.REACT_APP_STREAMING_ENABLED === 'true' || false,
  
  // Use the new streaming subscription instead of buffered output
  USE_STREAMING_SUBSCRIPTION: process.env.REACT_APP_USE_STREAMING_SUBSCRIPTION === 'true' || false,
  
  // Show streaming indicators in the UI
  SHOW_STREAMING_INDICATORS: process.env.REACT_APP_SHOW_STREAMING_INDICATORS === 'true' || true,
  
  // Enable cost accumulation during streaming
  STREAMING_COST_ACCUMULATION: process.env.REACT_APP_STREAMING_COST_ACCUMULATION === 'true' || true,
  
  // Smooth UI updates for streaming (adds buffering for smoother display)
  SMOOTH_STREAMING_UPDATES: process.env.REACT_APP_SMOOTH_STREAMING_UPDATES === 'true' || true,
  
  // Heartbeat timeout in milliseconds
  STREAMING_HEARTBEAT_TIMEOUT: parseInt(process.env.REACT_APP_STREAMING_HEARTBEAT_TIMEOUT || '60000', 10),
};

// Helper to check if streaming is fully enabled
export const isStreamingEnabled = () => {
  return features.STREAMING_ENABLED && features.USE_STREAMING_SUBSCRIPTION;
};