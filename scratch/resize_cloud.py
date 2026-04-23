from PIL import Image

def resize_to_3x():
    # 1. Get top dimensions
    try:
        top = Image.open('top.png')
        target_width = top.width * 3
        print(f"Top width: {top.width}, Target width: {target_width}")
    except Exception as e:
        print(f"Error opening top.png: {e}")
        return

    # 2. Resize cloud
    try:
        cloud = Image.open('cloud-12-e.png')
        # Calculate height based on aspect ratio
        ratio = cloud.height / cloud.width
        target_height = int(target_width * ratio)
        
        # Using high-quality resampling
        resized_cloud = cloud.resize((target_width, target_height), Image.Resampling.LANCZOS)
        resized_cloud.save('cloud-12.png')
        print(f"Successfully saved 3x cloud: {target_width}x{target_height}")
    except Exception as e:
        print(f"Error processing cloud-12-e.png: {e}")

if __name__ == "__main__":
    resize_to_3x()
