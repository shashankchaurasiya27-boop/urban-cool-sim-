import os

# Set dummy test secret key for test suite execution
if "SECRET_KEY" not in os.environ:
    os.environ["SECRET_KEY"] = "test_dummy_key_for_testing_secret_enforcement_32chars"
