IMAGE   := housing-api
CONTAINER := housing-api
PORT    := 9999

.PHONY: build run stop clean compose-up compose-down

build:
	docker build --no-cache -t $(IMAGE) .

run:
	docker run -d -p $(PORT):8000 --name $(CONTAINER) $(IMAGE)

stop:
	docker stop $(CONTAINER) && docker rm $(CONTAINER)

clean: stop
	docker rmi $(IMAGE)

compose-up:
	docker compose up --build -d

compose-down:
	docker compose down
