package com.philomath.api.web;

public class ProductNotFoundException extends RuntimeException {

    private final long id;

    public ProductNotFoundException(long id) {
        super("Product " + id + " was not found");
        this.id = id;
    }

    public long id() {
        return id;
    }
}
