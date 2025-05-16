import json
import asyncio
import websockets
import requests
import time
import traceback
from threading import Thread
from concurrent.futures import ThreadPoolExecutor

# Your Sonauto API key - replace with yours or use env variables
API_KEY = "${apiKey || 'YOUR_API_KEY_HERE'}"
SONAUTO_API_BASE = "https://api.sonauto.ai/v1"

# Store active tasks for polling
active_tasks = {}
connected_clients = set()
executor = ThreadPoolExecutor(max_workers=5)

# API Functions
def generate_music(params):
    endpoint = get_endpoint_for_type(params.get('generationType', 'new'))
    
    # Remove generationType as it's not part of the actual API
    api_params = params.copy()
    if 'generationType' in api_params:
        del api_params['generationType']
    
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    
    try:
        print(f"Sending request to {endpoint}")
        response = requests.post(endpoint, json=api_params, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        error_msg = "Failed to generate music"
        if hasattr(e, 'response') and e.response:
            try:
                error_data = e.response.json()
                error_msg = error_data.get('error', f"API error: {e.response.status_code}")
            except:
                error_msg = f"API error: {e.response.status_code}"
        print(f"Error generating music: {error_msg}")
        raise Exception(error_msg)

def check_status(task_id):
    headers = {
        'Authorization': f'Bearer {API_KEY}'
    }
    
    try:
        response = requests.get(f"{SONAUTO_API_BASE}/generations/status/{task_id}", headers=headers)
        response.raise_for_status()
        # API returns status as a quoted string
        status = response.text.strip('"')
        return status
    except requests.exceptions.RequestException as e:
        error_msg = "Failed to check status"
        if hasattr(e, 'response') and e.response:
            try:
                error_data = e.response.json()
                error_msg = error_data.get('error', f"Status check error: {e.response.status_code}")
            except:
                error_msg = f"Status check error: {e.response.status_code}"
        print(f"Error checking status: {error_msg}")
        raise Exception(error_msg)

def get_result(task_id):
    headers = {
        'Authorization': f'Bearer {API_KEY}'
    }
    
    try:
        response = requests.get(f"{SONAUTO_API_BASE}/generations/{task_id}", headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        error_msg = "Failed to get result"
        if hasattr(e, 'response') and e.response:
            try:
                error_data = e.response.json()
                error_msg = error_data.get('error', f"Result fetch error: {e.response.status_code}")
            except:
                error_msg = f"Result fetch error: {e.response.status_code}"
        print(f"Error getting result: {error_msg}")
        raise Exception(error_msg)

def get_endpoint_for_type(generation_type):
    if generation_type == 'new':
        return f"{SONAUTO_API_BASE}/generations"
    elif generation_type == 'extend':
        return f"{SONAUTO_API_BASE}/generations/extend"
    elif generation_type == 'inpaint':
        return f"{SONAUTO_API_BASE}/generations/inpaint"
    else:
        return f"{SONAUTO_API_BASE}/generations"

# Poll status and send updates
async def poll_status(task_id, websocket):
    if task_id in active_tasks:
        print(f"Already polling task {task_id}")
        return
    
    print(f"Starting to poll status for task {task_id}")
    active_tasks[task_id] = True
    completed = False
    
    timeout = time.time() + 30 * 60  # 30 minute timeout
    
    try:
        while not completed and time.time() < timeout:
            try:
                status = check_status(task_id)
                
                await websocket.send(json.dumps({
                    'type': 'status_update',
                    'status': status,
                    'taskId': task_id
                }))
                
                # Check if generation is complete
                if status == 'SUCCESS' or status == 'FAILURE':
                    completed = True
                    
                    # If success, fetch the full result
                    if status == 'SUCCESS':
                        try:
                            result = get_result(task_id)
                            await websocket.send(json.dumps({
                                'type': 'generation_result',
                                'result': result,
                                'taskId': task_id
                            }))
                        except Exception as result_error:
                            print(f"Error getting result for {task_id}: {str(result_error)}")
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': str(result_error),
                                'taskId': task_id
                            }))
                
                # Wait before polling again
                if not completed:
                    await asyncio.sleep(2)
                
            except Exception as poll_error:
                print(f"Error polling status for {task_id}: {str(poll_error)}")
                try:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': str(poll_error),
                        'taskId': task_id
                    }))
                except:
                    # Websocket might be closed
                    pass
                completed = True
    
        if not completed and time.time() >= timeout:
            print(f"Polling timeout for task {task_id}")
            try:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': 'Status polling timed out after 30 minutes',
                    'taskId': task_id
                }))
            except:
                # Websocket might be closed
                pass
    
    finally:
        # Always clean up
        if task_id in active_tasks:
            del active_tasks[task_id]
            print(f"Stopped polling for task {task_id}")

# WebSocket server handler
async def sonauto_bridge(websocket, path):
    client_id = id(websocket)
    print(f"Client connected: {client_id}")
    connected_clients.add(websocket)
    
    # Send connection confirmation
    await websocket.send(json.dumps({
        'type': 'connected',
        'message': 'Connected to Sonauto bridge server'
    }))
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                print(f"Received request: {data.get('action')} from client {client_id}")
                
                if data.get('action') == 'generate':
                    # Submit generation task to thread pool
                    future = executor.submit(generate_music, data.get('params', {}))
                    try:
                        response = future.result(timeout=60)  # 60 second timeout for the initial request
                        task_id = response.get('task_id')
                        
                        await websocket.send(json.dumps({
                            'type': 'generation_started',
                            'taskId': task_id
                        }))
                        
                        # Start status polling in a background task
                        asyncio.create_task(poll_status(task_id, websocket))
                        
                    except Exception as gen_error:
                        print(f"Error in generation: {str(gen_error)}")
                        traceback.print_exc()
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': str(gen_error)
                        }))
                    
                elif data.get('action') == 'status':
                    task_id = data.get('taskId')
                    if not task_id:
                        raise Exception("No taskId provided for status check")
                    
                    # Submit status check to thread pool
                    future = executor.submit(check_status, task_id)
                    try:
                        status = future.result(timeout=30)
                        await websocket.send(json.dumps({
                            'type': 'status_update',
                            'status': status,
                            'taskId': task_id
                        }))
                    except Exception as status_error:
                        print(f"Error checking status: {str(status_error)}")
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': str(status_error),
                            'taskId': task_id
                        }))
                    
                elif data.get('action') == 'result':
                    task_id = data.get('taskId')
                    if not task_id:
                        raise Exception("No taskId provided for result fetch")
                    
                    # Submit result fetch to thread pool
                    future = executor.submit(get_result, task_id)
                    try:
                        result = future.result(timeout=30)
                        await websocket.send(json.dumps({
                            'type': 'generation_result',
                            'result': result,
                            'taskId': task_id
                        }))
                    except Exception as result_error:
                        print(f"Error getting result: {str(result_error)}")
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': str(result_error),
                            'taskId': task_id
                        }))
                
                else:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': f"Unknown action: {data.get('action')}"
                    }))
                    
            except json.JSONDecodeError:
                print("Error: Invalid JSON message received")
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': 'Invalid JSON format in message'
                }))
                
            except Exception as e:
                print(f"Error processing message: {str(e)}")
                traceback.print_exc()
                try:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': str(e)
                    }))
                except:
                    # The websocket might be closed at this point
                    pass
                
    except websockets.exceptions.ConnectionClosed:
        print(f"Client disconnected: {client_id}")
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        traceback.print_exc()
    finally:
        # Clean up
        if websocket in connected_clients:
            connected_clients.remove(websocket)

async def status_server():
    """Simple server to report bridge status"""
    async def status_handler(websocket, path):
        await websocket.send(json.dumps({
            'status': 'running',
            'connected_clients': len(connected_clients),
            'active_tasks': len(active_tasks),
            'version': '1.1.0'
        }))
    
    try:
        async with websockets.serve(status_handler, "localhost", 3335):
            print("Status server running at ws://localhost:3335")
            await asyncio.Future()  # Run forever
    except Exception as e:
        print(f"Status server error: {str(e)}")

async def main():
    banner = """
============================================================
  Sonauto Bridge Server Running
============================================================
  WebSocket:  ws://localhost:3334
  Status:     ws://localhost:3335
  Connected:  0 clients
  
  This window must remain open for the bridge to work.
  Return to your browser to start generating music!
============================================================
"""
    print(banner)
    
    try:
        bridge_server = websockets.serve(sonauto_bridge, "localhost", 3334)
        status_task = asyncio.create_task(status_server())
        
        async with bridge_server:
            await asyncio.Future()  # Run forever
    except Exception as e:
        print(f"Server error: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down bridge server...")
    except Exception as e:
        print(f"Fatal error: {str(e)}")
        traceback.print_exc()