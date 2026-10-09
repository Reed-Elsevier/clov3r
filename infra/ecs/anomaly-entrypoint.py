import json
import os
import sys
from urllib.parse import quote


def build_environment(environment):
    credentials = json.loads(environment["DB_CREDENTIALS"])
    username = quote(credentials["username"], safe="")
    password = quote(credentials["password"], safe="")
    host = environment["DB_HOST"]
    database = quote(environment["DB_NAME"], safe="")
    if not username or not password or not host or not database:
        raise ValueError("Missing database connection settings")
    child_environment = dict(environment)
    child_environment["DATABASE_URL"] = (
        f"postgresql://{username}:{password}@{host}:5432/{database}?sslmode=require"
    )
    del child_environment["DB_CREDENTIALS"]
    return child_environment


def start():
    try:
        environment = build_environment(os.environ)
    except (KeyError, TypeError, ValueError):
        sys.exit("Unable to initialize database settings from the injected secret")
    command = sys.argv[1:]
    if not command:
        sys.exit("Missing anomaly-engine start command")
    try:
        os.execvpe(command[0], command, environment)
    except OSError:
        sys.exit("Unable to start anomaly engine")


if __name__ == "__main__":
    start()