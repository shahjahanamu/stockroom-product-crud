#!/usr/bin/env python3
"""Exercise CRUD through the frontend proxy; remove only the test product."""
import json
import sys
import time
import urllib.error
import urllib.request
import uuid

origin = sys.argv[1].rstrip('/')
base = origin + '/api/products'

def request(method, path='', data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(base + path, data=body, method=method,
                                 headers={'Content-Type': 'application/json', 'Origin': origin})
    with urllib.request.urlopen(req, timeout=5) as response:
        body = response.read()
        return response.status, json.loads(body) if body else None

for attempt in range(60):
    try:
        status, products = request('GET')
        assert status == 200 and isinstance(products, list)
        break
    except (OSError, ValueError, AssertionError):
        if attempt == 59:
            raise
        time.sleep(2)

with urllib.request.urlopen(origin + '/', timeout=5) as response:
    html = response.read().decode()
    assert response.status == 200 and '<app-root' in html and '<script' in html

product_id = None
try:
    name = 'ci-smoke-' + uuid.uuid4().hex
    status, product = request('POST', data={'name': name, 'description': 'temporary', 'price': 12.50})
    product_id = product['id']
    assert status == 201
    assert request('GET', f'/{product_id}')[1]['name'] == name
    status, updated = request('PUT', f'/{product_id}', {'name': name, 'description': 'updated', 'price': 23.50})
    assert status == 200 and updated['price'] == 23.50
    assert any(p['id'] == product_id for p in request('GET')[1])
    assert request('DELETE', f'/{product_id}')[0] == 204
    deleted_id, product_id = product_id, None
    try:
        request('GET', f'/{deleted_id}')
        raise AssertionError('Deleted product still exists')
    except urllib.error.HTTPError as error:
        assert error.code == 404
    print('CRUD smoke test passed')
finally:
    if product_id is not None:
        request('DELETE', f'/{product_id}')
