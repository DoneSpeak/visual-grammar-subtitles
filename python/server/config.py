import logging
import os
from pathlib import Path
import secrets


def data_directory():
    return Path(os.environ.get('NLP_DATA_DIR', '.data'))


def load_api_token(data_dir, token=None):
    if token is None:
        token = os.environ.get('NLP_API_TOKEN')
    if token is not None:
        if len(token) < 16:
            raise RuntimeError('NLP_API_TOKEN must contain at least 16 characters')
        return token

    data_dir = Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    token_file = data_dir / 'api-token'
    try:
        fd = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        token = token_file.read_text().strip()
    else:
        token = secrets.token_hex(24)
        with os.fdopen(fd, 'w') as stream:
            stream.write(token + '\n')
    if len(token) < 16:
        raise RuntimeError(f'Invalid API token in {token_file}; provide NLP_API_TOKEN or remove this file to regenerate it')
    logging.getLogger('uvicorn.error').info(
        'Using local API token from %s; run make nlp-token to copy it into the extension settings.',
        token_file.resolve(),
    )
    return token


if __name__ == '__main__':
    print(load_api_token(data_directory()))
