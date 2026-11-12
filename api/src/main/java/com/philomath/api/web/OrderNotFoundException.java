package com.philomath.api.web;

public class OrderNotFoundException extends RuntimeException {

    private final long id;

    public OrderNotFoundException(long id) {
        super("Order " + id + " was not found");
        this.id = id;
    }

    public long id() {
        return id;
    }
}
